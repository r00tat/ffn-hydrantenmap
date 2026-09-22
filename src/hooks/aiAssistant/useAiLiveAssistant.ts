import { useCallback, useEffect, useRef, useState } from 'react';
import { CONVERSATION_PROMPT } from '../../common/ai';
import { createLiveToken } from '../../app/actions/aiLiveToken';
import { FirecallItem } from '../../components/firebase/firestore';
import {
  isLiveAudioSupported,
  LivePlayback,
  MicrophoneCapture,
  startMicrophoneCapture,
} from './liveAudio';
import { connectLiveSession, LiveConnection } from './liveConnection';
import { LiveConversationStatus, runLiveConversation } from './liveConversation';
import { AiAssistantResult } from './types';
import useAiToolRunner from './useAiToolRunner';

export type AiLiveStatus = 'idle' | LiveConversationStatus;

export interface AiLiveCallbacks {
  /** Ein abgeschlossener Beitrag des Modells. */
  onTurn?: (result: AiAssistantResult) => void;
  /** Die Antwort, während sie gesprochen wird — für die Anzeige. */
  onPartialAnswer?: (text: string) => void;
  /** Was der Benutzer gerade sagt. */
  onHeard?: (text: string) => void;
}

/**
 * Sprach-Gespräch über eine Live-Sitzung.
 *
 * Die Sitzung lebt vom „Gespräch starten" bis zum „Gespräch beenden" und trägt
 * viele Sprecherwechsel. Das Mikrofon bleibt offen, der Server erkennt die
 * Sprechpause selbst und antwortet; wer dem Modell ins Wort fällt,
 * unterbricht es.
 *
 * Der entscheidende Unterschied zum früheren Einzelbefehl ist, **wann** der
 * Kartenkontext hinausgeht: einmal zu Beginn, vor dem ersten Wort. Vorher ging
 * er mit dem Abschluss des Beitrags hinaus — und kam damit regelmäßig zu spät,
 * weil der Server den Sprecherwechsel längst selbst geschlossen und geantwortet
 * hatte. Das Modell wählte sein Werkzeug ohne Kartenkontext und legte Fragen
 * als Tagebucheintrag ab.
 *
 * Preis dieser Umstellung: Der Kontext ist so alt wie das Gespräch. Deshalb
 * wird er nach jedem Beitrag nachgereicht, aber nur, wenn er sich geändert hat.
 *
 * Hintergrund: [docs/ai-sprachassistent.md](../../../docs/ai-sprachassistent.md)
 */
export default function useAiLiveAssistant(
  existingItems: FirecallItem[],
  callbacks: AiLiveCallbacks = {},
) {
  const { executeTool, buildContextText, lastCreatedItem, undoLastAction } =
    useAiToolRunner(existingItems);

  const sessionRef = useRef<LiveConnection | null>(null);
  const captureRef = useRef<MicrophoneCapture | null>(null);
  const playbackRef = useRef<LivePlayback | null>(null);
  /** Zuletzt gesendeter Kartenkontext — verhindert unnötige Wiederholungen. */
  const sentContextRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AiLiveStatus>('idle');

  // Die Rückrufe wandern in ein Ref, damit die laufende Schleife immer die
  // aktuellen erwischt: Sie startet einmal und läuft das ganze Gespräch lang,
  // während die Komponente darüber beliebig oft neu rendert.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const cleanup = useCallback(async () => {
    const capture = captureRef.current;
    const playback = playbackRef.current;
    const session = sessionRef.current;
    captureRef.current = null;
    playbackRef.current = null;
    sessionRef.current = null;
    sentContextRef.current = null;

    await capture?.stop().catch(() => undefined);
    await playback?.close().catch(() => undefined);
    if (session && !session.isClosed) {
      await session.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  /**
   * Schickt den Kartenkontext als offenen Beitrag — ohne `turnComplete`, damit
   * er dem Gespräch beiliegt, ohne eine Antwort auszulösen.
   */
  const sendContext = useCallback(
    async (session: LiveConnection) => {
      const contextText = buildContextText();
      if (contextText === sentContextRef.current) {
        return;
      }
      sentContextRef.current = contextText;
      await session.send([{ text: contextText }], false);
    },
    [buildContextText],
  );

  /**
   * Gespräch eröffnen: Verbindung, Kontext, Gesprächsregeln, Mikrofon — in
   * dieser Reihenfolge. Ab dem letzten Schritt hört das Modell mit.
   */
  const startConversation = useCallback(async (): Promise<void> => {
    // Vor allem anderen und ohne `await` davor: Der Aufruf muss in der
    // Benutzeraktion liegen, sonst bleibt die Wiedergabe stumm. Begründung
    // an `LivePlayback.prime()`.
    const playback = new LivePlayback();
    playback.prime();

    await cleanup();
    playbackRef.current = playback;

    const { token, model, error, detail } = await createLiveToken();
    if (!token || !model) {
      throw new Error(`Live-Token nicht verfügbar (${error}${detail ? `: ${detail}` : ''})`);
    }
    const session = await connectLiveSession(token, model);
    sessionRef.current = session;

    try {
      await sendContext(session);
      await session.send([{ text: CONVERSATION_PROMPT }], false);

      captureRef.current = await startMicrophoneCapture((chunk) => {
        void session.sendAudioRealtime({ mimeType: 'audio/pcm', data: chunk });
      });
    } catch (error) {
      await cleanup();
      throw error;
    }

    setStatus('listening');

    // Läuft für sich weiter, bis die Sitzung endet — deshalb kein `await`.
    void runLiveConversation({
      messages: session.receive(),
      executeTool,
      sendFunctionResponses: (responses) => session.sendFunctionResponses(responses),
      onAudio: (base64Pcm) => playback.enqueue(base64Pcm),
      onInterrupt: () => playback.interrupt(),
      onStatus: setStatus,
      onHeard: (text) => callbacksRef.current.onHeard?.(text),
      onPartialAnswer: (text) => callbacksRef.current.onPartialAnswer?.(text),
      onTurn: (result) => {
        callbacksRef.current.onTurn?.(result);
        // Ein Werkzeug hat womöglich die Karte verändert; der nächste Beitrag
        // soll den neuen Stand sehen.
        if (sessionRef.current === session && !session.isClosed) {
          void sendContext(session).catch(() => undefined);
        }
      },
      onEnd: () => setStatus('idle'),
    }).catch((error) => {
      console.error('[AI] Live-Gespräch abgebrochen:', error);
      setStatus('idle');
    });
  }, [cleanup, executeTool, sendContext]);

  /**
   * „Ich bin fertig" — schließt den gesprochenen Beitrag sofort, statt auf die
   * Sprechpause zu warten. Das Gespräch läuft weiter.
   */
  const finishSpeaking = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    if (!session || session.isClosed) {
      return;
    }
    await session.sendAudioStreamEnd().catch(() => undefined);
  }, []);

  const endConversation = useCallback(async () => {
    // Das Mikrofon zuerst: Was jetzt noch gesagt wird, gehört nicht mehr dazu.
    await captureRef.current?.stop().catch(() => undefined);
    captureRef.current = null;
    // Auf das Ende der Wiedergabe wird nicht gewartet — wer beendet, will
    // Ruhe, nicht den Rest des Satzes.
    await cleanup();
    setStatus('idle');
  }, [cleanup]);

  return {
    /** Ob die Umgebung Live-Audio überhaupt unterstützt (Web Audio, AudioWorklet). */
    isSupported: isLiveAudioSupported(),
    status,
    isActive: status !== 'idle',
    startConversation,
    finishSpeaking,
    endConversation,
    undoLastAction,
    lastCreatedItem,
  };
}
