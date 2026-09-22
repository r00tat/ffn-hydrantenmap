import { FunctionResponse, Part } from 'firebase/ai';
import { liveModelPath } from '../../common/aiLiveToken';
import { LiveMessage } from './liveTurn';

/**
 * Die Live-Verbindung des Browsers — ohne Firebase-SDK.
 *
 * Warum von Hand: Das SDK (`@firebase/ai`) baut die WebSocket-Adresse fest mit
 * `?key=<apiKey>` und kennt nur den Firebase-Proxy-Pfad. Ein kurzlebiges Token
 * verlangt beides anders — `?access_token=` und den Endpunkt
 * `BidiGenerateContentConstrained` —, und das SDK bietet keine Stelle, an der
 * sich das ändern ließe. Die Verbindung ist deshalb hier nachgebaut; das
 * Protokoll darüber (`liveTurn.ts`) bleibt unverändert, weil die Nachrichten
 * genau so weitergereicht werden, wie das SDK sie geliefert hat.
 *
 * Hintergrund: [docs/ai-sprachassistent.md](../../../docs/ai-sprachassistent.md)
 */

const LIVE_WS_HOST = 'generativelanguage.googleapis.com';

/**
 * Kurzlebige Tokens gibt es nur unter `v1alpha` — so steht es im Live-Modul
 * des offiziellen SDK (`js-genai`), das bei jeder anderen Fassung warnt.
 * Die Übersichtsseite der Doku nennt `v1beta`; im Zweifel gilt der Code.
 */
export const LIVE_API_VERSION = 'v1alpha';

export function liveWebSocketUrl(token: string): string {
  const url = new URL(`wss://${LIVE_WS_HOST}`);
  url.pathname = `/ws/google.ai.generativelanguage.${LIVE_API_VERSION}.GenerativeService.BidiGenerateContentConstrained`;
  url.searchParams.set('access_token', token);
  return url.toString();
}

export interface LiveConnection {
  readonly isClosed: boolean;
  /** Schließt den Sprecherwechsel ab und schickt den Text mit. */
  send(parts: Part[], turnComplete: boolean): Promise<void>;
  /** 16-bit-PCM, 16 kHz, base64 — laufend während der Aufnahme. */
  sendAudioRealtime(blob: { mimeType: string; data: string }): Promise<void>;
  sendFunctionResponses(responses: FunctionResponse[]): Promise<void>;
  receive(): AsyncGenerator<LiveMessage>;
  close(): Promise<void>;
}

/** Wandelt `{serverContent: {...}}` in `{type: 'serverContent', ...}`. */
function tagMessage(message: Record<string, unknown>): LiveMessage | undefined {
  if ('serverContent' in message) {
    return { type: 'serverContent', ...(message.serverContent as object) } as LiveMessage;
  }
  if ('toolCall' in message) {
    return { type: 'toolCall', ...(message.toolCall as object) } as LiveMessage;
  }
  if ('toolCallCancellation' in message) {
    return {
      type: 'toolCallCancellation',
      ...(message.toolCallCancellation as object),
    } as LiveMessage;
  }
  if ('goAway' in message) {
    const { timeLeft } = message.goAway as { timeLeft?: string };
    return {
      type: 'goingAwayNotice',
      // Die API schreibt Dauern als `"30s"`.
      timeLeft: timeLeft?.endsWith('s') ? Number(timeLeft.slice(0, -1)) : 0,
    } as LiveMessage;
  }
  if ('sessionResumptionUpdate' in message) {
    return {
      type: 'sessionResumptionUpdate',
      ...(message.sessionResumptionUpdate as object),
    } as LiveMessage;
  }
  return undefined;
}

/**
 * Kurzfassung einer Servernachricht fürs Protokoll.
 *
 * Roh ausgeben geht nicht: Ein einziger Tonblock des Modells sind einige
 * Kilobyte base64 und kämen alle 20 ms. Hier steht deshalb nur, *was* kam.
 */
function describeMessage(message: Record<string, unknown>): unknown {
  const content = message.serverContent as Record<string, unknown> | undefined;
  if (!content) {
    return Object.keys(message);
  }
  const parts = (content.modelTurn as { parts?: unknown[] } | undefined)?.parts ?? [];
  const audio = parts.filter(
    (part) => (part as { inlineData?: { mimeType?: string } }).inlineData?.mimeType?.startsWith('audio/'),
  ).length;
  return {
    ...(audio ? { tonbloecke: audio } : {}),
    ...(content.inputTranscription
      ? { gehoert: (content.inputTranscription as { text?: string }).text }
      : {}),
    ...(content.outputTranscription
      ? { gesagt: (content.outputTranscription as { text?: string }).text }
      : {}),
    ...(content.generationComplete ? { generationComplete: true } : {}),
    ...(content.turnComplete ? { turnComplete: true } : {}),
    ...(content.interrupted ? { interrupted: true } : {}),
  };
}

async function payloadText(data: unknown): Promise<string | undefined> {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Blob) {
    return data.text();
  }
  return undefined;
}

/**
 * Öffnet die Sitzung und wartet den Handshake ab.
 *
 * Das Setup, das hier hinausgeht, ist absichtlich mager: Steht im Token ein
 * `bidiGenerateContentSetup` — und das tut es —, verwirft der Server das Setup
 * des Browsers vollständig. Der Modellname bleibt trotzdem drin, damit die
 * Nachricht für sich gültig ist und ein Fehler sich lesen lässt.
 */
export async function connectLiveSession(
  token: string,
  model: string,
): Promise<LiveConnection> {
  const socket = new WebSocket(liveWebSocketUrl(token));

  /** Was eingetroffen ist, bevor jemand zuhört. `receive()` holt es nach. */
  const queue: LiveMessage[] = [];
  let notify: (() => void) | undefined;
  let finished = false;
  /** Der Handshake belegt die erste Nachricht; danach zählt die Schlange. */
  let handshakeDone = false;

  const wake = () => {
    notify?.();
    notify = undefined;
  };

  await new Promise<void>((resolve, reject) => {
    const onMessage = async (event: Event) => {
      const text = await payloadText((event as MessageEvent).data);
      if (!text) {
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }

      if (!handshakeDone) {
        handshakeDone = true;
        if ('setupComplete' in message) {
          resolve();
        } else {
          reject(
            new Error(
              'Live-Sitzung: der Server hat den Handshake nicht mit setupComplete bestätigt',
            ),
          );
        }
        return;
      }

      console.debug('[AI-Live] <<', describeMessage(message));

      const tagged = tagMessage(message);
      if (tagged) {
        queue.push(tagged);
        wake();
      }
    };

    const onClose = (event: Event) => {
      finished = true;
      wake();
      if (!handshakeDone) {
        const { reason } = event as CloseEvent;
        reject(
          new Error(
            `Live-Sitzung: Verbindung vom Server abgewiesen${reason ? `: ${reason}` : ''}`,
          ),
        );
      }
    };

    socket.addEventListener('message', onMessage as EventListener);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', () => {
      if (!handshakeDone) {
        reject(new Error('Live-Sitzung: Verbindung fehlgeschlagen'));
      }
    });
    socket.addEventListener(
      'open',
      () => {
        socket.send(JSON.stringify({ setup: { model: liveModelPath(model) } }));
      },
      { once: true },
    );
  });

  /** Nur fürs Protokoll: wie viel Ton in diesem Beitrag hinausgegangen ist. */
  let audioChunks = 0;
  let audioBytes = 0;

  const sendRaw = (message: unknown) => {
    if (finished) {
      throw new Error('Live-Sitzung: die Verbindung ist bereits geschlossen');
    }
    socket.send(JSON.stringify(message));
  };

  return {
    get isClosed() {
      return finished;
    },

    async send(parts, turnComplete) {
      // Hier und nicht je Block: Ein Block kommt alle paar Millisekunden, die
      // Summe ist die Zahl, die zählt — steht sie auf null, hat das Mikrofon
      // nichts geliefert.
      console.info('[AI-Live] >> Ton gesendet:', {
        bloecke: audioChunks,
        bytes: audioBytes,
        sekunden: Math.round((audioBytes / 32000) * 10) / 10,
      });
      console.info('[AI-Live] >> Beitrag abgeschlossen:', {
        teile: parts.length,
        zeichen: parts.reduce(
          (sum, part) => sum + ('text' in part && part.text ? part.text.length : 0),
          0,
        ),
        turnComplete,
      });
      sendRaw({
        clientContent: { turns: [{ role: 'user', parts }], turnComplete },
      });
    },

    async sendAudioRealtime(blob) {
      audioChunks += 1;
      // base64 → rohe Bytes, für die Sekundenangabe oben.
      audioBytes += Math.round((blob.data.length * 3) / 4);
      sendRaw({ realtimeInput: { audio: blob } });
    },

    async sendFunctionResponses(functionResponses) {
      console.info(
        '[AI-Live] >> Werkzeugantworten:',
        functionResponses.map((response) => response.name),
      );
      sendRaw({ toolResponse: { functionResponses } });
    },

    async *receive() {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        if (finished) {
          return;
        }
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    },

    async close() {
      finished = true;
      wake();
      socket.close();
    },
  };
}
