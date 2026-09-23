// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectLiveSession,
  LIVE_API_VERSION,
  liveWebSocketUrl,
} from './liveConnection';

/**
 * Ein WebSocket, der nicht ins Netz geht. Die Tests steuern ihn von aussen:
 * `accept()` oeffnet ihn, `emit()` stellt eine Servernachricht zu.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    (this.listeners[type] ||= []).push(handler);
  }

  removeEventListener(type: string, handler: (event: unknown) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((h) => h !== handler);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.fire('close', { reason: '' });
  }

  accept() {
    this.readyState = FakeWebSocket.OPEN;
    this.fire('open', {});
  }

  emit(message: unknown) {
    this.fire('message', { data: JSON.stringify(message) });
  }

  /** Browser liefern die Nutzlast als Blob, nicht als Zeichenkette. */
  emitBlob(message: unknown) {
    this.fire('message', { data: new Blob([JSON.stringify(message)]) });
  }

  fail(reason: string) {
    this.fire('close', { reason });
  }

  private fire(type: string, event: unknown) {
    for (const handler of this.listeners[type] || []) {
      handler(event);
    }
  }
}

/** Oeffnet eine Sitzung und beantwortet den Handshake. */
async function openSession(model = 'gemini-3.8-live') {
  const pending = connectLiveSession('auth_tokens/abc', model);
  const socket = FakeWebSocket.instances.at(-1)!;
  socket.accept();
  socket.emit({ setupComplete: {} });
  return { session: await pending, socket };
}

function sentMessages(socket: FakeWebSocket) {
  return socket.sent.map((raw) => JSON.parse(raw));
}

describe('liveWebSocketUrl', () => {
  it('nutzt den beschraenkten Endpunkt und das Token als access_token', () => {
    const url = liveWebSocketUrl('auth_tokens/abc');
    // Der beschraenkte Endpunkt ist der einzige, der ein Token annimmt — der
    // gewoehnliche will einen API-Key.
    expect(url).toContain('BidiGenerateContentConstrained');
    expect(url).toContain(`google.ai.generativelanguage.${LIVE_API_VERSION}`);
    expect(url).toContain('access_token=auth_tokens%2Fabc');
    // Kein API-Key im Browser — das ist der ganze Zweck der Uebung.
    expect(url).not.toContain('key=AIza');
  });
});

describe('connectLiveSession', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schickt ein Setup und wartet auf setupComplete', async () => {
    const { session, socket } = await openSession();

    expect(session.isClosed).toBe(false);
    expect(sentMessages(socket)[0]).toEqual({
      setup: { model: 'models/gemini-3.8-live' },
    });
  });

  it('bricht ab, wenn der Server den Handshake nicht bestaetigt', async () => {
    const pending = connectLiveSession('auth_tokens/abc', 'gemini-live');
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.accept();
    socket.emit({ serverContent: { turnComplete: true } });

    await expect(pending).rejects.toThrow(/setupComplete/);
  });

  it('meldet den Grund, wenn der Server die Verbindung abweist', async () => {
    const pending = connectLiveSession('auth_tokens/abc', 'gemini-live');
    FakeWebSocket.instances.at(-1)!.fail('Invalid token');

    await expect(pending).rejects.toThrow(/Invalid token/);
  });

  it('schickt Beitraege als clientContent mit turnComplete', async () => {
    const { session, socket } = await openSession();

    await session.send([{ text: 'Kontext' }, { text: 'Befehl' }], true);

    expect(sentMessages(socket)[1]).toEqual({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: 'Kontext' }, { text: 'Befehl' }] }],
        turnComplete: true,
      },
    });
  });

  it('schickt Ton als realtimeInput', async () => {
    const { session, socket } = await openSession();

    await session.sendAudioRealtime({ mimeType: 'audio/pcm', data: 'AAAA' });

    expect(sentMessages(socket)[1]).toEqual({
      realtimeInput: { audio: { mimeType: 'audio/pcm', data: 'AAAA' } },
    });
  });

  it('schickt Werkzeugergebnisse als toolResponse', async () => {
    const { session, socket } = await openSession();

    await session.sendFunctionResponses([{ name: 'createItem', response: { ok: true } }]);

    expect(sentMessages(socket)[1]).toEqual({
      toolResponse: {
        functionResponses: [{ name: 'createItem', response: { ok: true } }],
      },
    });
  });

  it('gibt Servernachrichten mit einer Kennung weiter', async () => {
    const { session, socket } = await openSession();

    socket.emit({ serverContent: { outputTranscription: { text: 'Erledigt.' } } });
    socket.emit({ toolCall: { functionCalls: [{ name: 'createItem', args: {} }] } });
    socket.emit({ serverContent: { turnComplete: true } });

    const messages = [];
    for await (const message of session.receive()) {
      messages.push(message);
      if (messages.length === 3) break;
    }

    // Dieselbe Form, die das Firebase-SDK geliefert hat — `liveConversation` bleibt
    // dadurch unveraendert.
    expect(messages[0]).toEqual({
      type: 'serverContent',
      outputTranscription: { text: 'Erledigt.' },
    });
    expect(messages[1]).toEqual({
      type: 'toolCall',
      functionCalls: [{ name: 'createItem', args: {} }],
    });
    expect(messages[2]).toEqual({ type: 'serverContent', turnComplete: true });
  });

  it('puffert Nachrichten, die vor dem Zuhoeren eintreffen', async () => {
    const { session, socket } = await openSession();

    // Zwischen `send` und `receive` liegt im Hook ein await — was in dieser
    // Luecke ankommt, darf nicht verloren gehen.
    socket.emit({ serverContent: { turnComplete: true } });

    const first = (await session.receive().next()).value;
    expect(first).toEqual({ type: 'serverContent', turnComplete: true });
  });

  it('liest auch eine Nutzlast, die als Blob ankommt', async () => {
    const { session, socket } = await openSession();

    socket.emitBlob({ serverContent: { turnComplete: true } });

    const first = (await session.receive().next()).value;
    expect(first).toEqual({ type: 'serverContent', turnComplete: true });
  });

  it('uebersetzt goAway in die bekannte Ankuendigung', async () => {
    const { session, socket } = await openSession();

    socket.emit({ goAway: { timeLeft: '30s' } });

    const first = (await session.receive().next()).value;
    expect(first).toEqual({ type: 'goingAwayNotice', timeLeft: 30 });
  });

  it('beendet den Nachrichtenstrom, wenn die Verbindung schliesst', async () => {
    const { session, socket } = await openSession();

    socket.close();

    const messages = [];
    for await (const message of session.receive()) {
      messages.push(message);
    }
    expect(messages).toEqual([]);
    expect(session.isClosed).toBe(true);
  });

  it('schliesst die Verbindung auf Zuruf', async () => {
    const { session, socket } = await openSession();

    await session.close();

    expect(socket.closed).toBe(true);
    expect(session.isClosed).toBe(true);
  });
});
