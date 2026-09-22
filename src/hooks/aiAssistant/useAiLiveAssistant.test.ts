// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { actAsync } from '../../test-utils/actHelpers';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() })),
}));
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  signOut: vi.fn(),
}));

vi.mock('../../components/firebase/firebase', () => ({ firestore: {} }));
vi.mock('../../components/firebase/firestore', () => ({
  FIRECALL_COLLECTION_ID: 'call',
  FIRECALL_ITEMS_COLLECTION_ID: 'item',
}));
vi.mock('../../components/firebase/aiTools', () => ({
  AI_SYSTEM_PROMPT: 'test',
  AI_TOOL_DECLARATIONS: [],
}));
vi.mock('../useFirecallItemAdd', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('../useFirecallItemUpdate', () => ({ default: vi.fn(() => vi.fn()) }));
vi.mock('../useFirecall', () => ({
  useFirecallId: vi.fn(() => 'test-firecall'),
  useFirecall: vi.fn(() => ({ id: 'test-firecall', name: 'Test' })),
}));
vi.mock('../useMapEditor', () => ({ useHistoryPathSegments: vi.fn(() => []) }));
vi.mock('../../components/actions/maps/places', () => ({ searchPlace: vi.fn() }));
vi.mock('./toolHandlers', () => ({ executeToolCall: vi.fn() }));

const capture = { stop: vi.fn().mockResolvedValue(undefined) };
const playback = {
  prime: vi.fn(),
  enqueue: vi.fn(),
  interrupt: vi.fn(),
  whenDrained: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./liveAudio', () => ({
  isLiveAudioSupported: () => true,
  startMicrophoneCapture: vi.fn(async () => capture),
  LivePlayback: vi.fn(function LivePlaybackMock() {
    return playback;
  }),
}));

const session = {
  isClosed: false,
  send: vi.fn().mockResolvedValue(undefined),
  sendAudioRealtime: vi.fn().mockResolvedValue(undefined),
  sendAudioStreamEnd: vi.fn().mockResolvedValue(undefined),
  sendFunctionResponses: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  receive: vi.fn(),
};

const connect = vi.fn(async (token: string, model: string) => {
  void token;
  void model;
  return session;
});
vi.mock('./liveConnection', () => ({
  connectLiveSession: (token: string, model: string) => connect(token, model),
}));

const createLiveToken = vi.fn(async () => ({
  token: 'auth_tokens/abc',
  model: 'gemini-live',
}));
vi.mock('../../app/actions/aiLiveToken', () => ({
  createLiveToken: () => createLiveToken(),
}));

import useAiLiveAssistant from './useAiLiveAssistant';

/** Ein Strom, der offen bleibt — wie eine laufende Sitzung. */
function neverEnding() {
  session.receive.mockImplementation(async function* () {
    await new Promise(() => undefined);
  });
}

function answersOnce(text: string) {
  session.receive.mockImplementation(async function* () {
    yield { type: 'serverContent', outputTranscription: { text }, turnComplete: true };
  });
}

describe('useAiLiveAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.isClosed = false;
    connect.mockResolvedValue(session);
    createLiveToken.mockResolvedValue({ token: 'auth_tokens/abc', model: 'gemini-live' });
    neverEnding();
  });

  it('schickt den Kartenkontext, bevor das Mikrofon aufgeht', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startConversation());

    // Der Kern der Umstellung: Der Kontext muss da sein, bevor das erste Wort
    // fällt. Ging er wie früher erst mit dem Abschluss des Beitrags hinaus,
    // hatte der Server längst selbst geantwortet.
    const { startMicrophoneCapture } = await import('./liveAudio');
    expect(session.send.mock.invocationCallOrder[0]).toBeLessThan(
      (startMicrophoneCapture as unknown as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0],
    );

    const [contextParts, contextComplete] = session.send.mock.calls[0];
    expect(contextParts[0].text).toContain('mapCenter');
    // Ohne `turnComplete`: Der Kontext liegt dem Gespräch bei, löst aber keine
    // Antwort aus.
    expect(contextComplete).toBe(false);

    const [promptParts] = session.send.mock.calls[1];
    expect(promptParts[0].text).toContain('Beantworte eine Frage');
  });

  it('meldet jeden Beitrag über den Rückruf, nicht als Rückgabewert', async () => {
    answersOnce('Zwei Fahrzeuge sind vor Ort.');
    const onTurn = vi.fn();
    const { result } = renderHook(() => useAiLiveAssistant([], { onTurn }));

    await actAsync(() => result.current.startConversation());

    expect(onTurn).toHaveBeenCalledTimes(1);
    expect(onTurn.mock.calls[0][0].message).toBe('Zwei Fahrzeuge sind vor Ort.');
  });

  it('bleibt nach einer Antwort offen', async () => {
    answersOnce('Erledigt.');
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startConversation());

    // Nur der Nachrichtenstrom ist zu Ende, nicht das Gespräch: Geschlossen
    // wird ausschließlich auf Wunsch des Benutzers.
    expect(session.close).not.toHaveBeenCalled();
  });

  it('schließt Mikrofon und Sitzung erst beim Beenden', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startConversation());
    expect(capture.stop).not.toHaveBeenCalled();

    await actAsync(() => result.current.endConversation());

    expect(capture.stop).toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('schickt „fertig" ohne die Sitzung zu schließen', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startConversation());
    await actAsync(() => result.current.finishSpeaking());

    expect(session.sendAudioStreamEnd).toHaveBeenCalledTimes(1);
    expect(session.close).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(true);
  });

  it('weckt die Wiedergabe beim Drücken, nicht erst beim ersten Ton', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startConversation());

    // Der Kontext muss in der Benutzeraktion entstehen, sonst bleibt er
    // nach den Autoplay-Regeln stumm — und zwar lautlos, weil angekommener
    // Ton die Sprachausgabe des Browsers unterdrückt.
    expect(playback.prime).toHaveBeenCalled();
    expect(playback.prime.mock.invocationCallOrder[0]).toBeLessThan(
      createLiveToken.mock.invocationCallOrder[0],
    );
    const { LivePlayback } = await import('./liveAudio');
    expect(LivePlayback).toHaveBeenCalledTimes(1);
  });

  it('holt das Token vom Server und verbindet erst damit', async () => {
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await actAsync(() => result.current.startConversation());

    expect(createLiveToken).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith('auth_tokens/abc', 'gemini-live');
  });

  it('verbindet gar nicht erst, wenn der Server kein Token ausgibt', async () => {
    createLiveToken.mockResolvedValueOnce({ error: 'quota' } as never);
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await expect(actAsync(() => result.current.startConversation())).rejects.toThrow('quota');
    expect(connect).not.toHaveBeenCalled();
  });

  it('gibt einen gescheiterten Verbindungsaufbau nach außen weiter', async () => {
    connect.mockRejectedValueOnce(new Error('api not enabled'));
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await expect(actAsync(() => result.current.startConversation())).rejects.toThrow(
      'api not enabled',
    );
    expect(result.current.status).toBe('idle');
  });

  it('räumt die Sitzung auf, wenn das Mikrofon nicht startet', async () => {
    const { startMicrophoneCapture } = await import('./liveAudio');
    (startMicrophoneCapture as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('NotAllowedError'),
    );
    const { result } = renderHook(() => useAiLiveAssistant([]));

    await expect(actAsync(() => result.current.startConversation())).rejects.toThrow(
      'NotAllowedError',
    );
    expect(session.close).toHaveBeenCalled();
  });
});
