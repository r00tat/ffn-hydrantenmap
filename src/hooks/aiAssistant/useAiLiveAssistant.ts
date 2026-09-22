import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_TURN_PROMPT } from '../../common/ai';
import { createLiveToken } from '../../app/actions/aiLiveToken';
import { FirecallItem } from '../../components/firebase/firestore';
import { LatencyRun } from './latency';
import {
  isLiveAudioSupported,
  LivePlayback,
  MicrophoneCapture,
  startMicrophoneCapture,
} from './liveAudio';
import { connectLiveSession, LiveConnection } from './liveConnection';
import { runLiveTurn } from './liveTurn';
import { AiAssistantResult } from './types';
import useAiToolRunner from './useAiToolRunner';

export type AiLiveStatus = 'idle' | 'listening' | 'analyzing' | 'executing';


/**
 * Sprachbefehl über eine Live-Sitzung — ein Sprecherwechsel je Tastendruck.
 *
 * Die Sitzung lebt nur für diesen einen Befehl. Das ist die Eigenschaft, an
 * der alles Weitere hängt: Der Kartenkontext geht wie beim Einzelaufruf frisch
 * mit dem abschließenden Beitrag hinaus und kann nicht veralten, das
 * Zeitlimit einer Audio-Sitzung und die Wiederaufnahme nach einem Abriss
 * spielen keine Rolle, und das Mikrofon ist außerhalb des Tastendrucks zu.
 *
 * Hintergrund: [docs/ai-sprachassistent.md](../../../docs/ai-sprachassistent.md)
 */
export default function useAiLiveAssistant(existingItems: FirecallItem[]) {
  const { executeTool, buildContextText, contextStats, lastCreatedItem, undoLastAction } =
    useAiToolRunner(existingItems);

  const sessionRef = useRef<LiveConnection | null>(null);
  const captureRef = useRef<MicrophoneCapture | null>(null);
  const playbackRef = useRef<LivePlayback | null>(null);
  /** Nur zur Anzeige in der Messung — welches Modell das Token benannt hat. */
  const modelRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AiLiveStatus>('idle');

  const cleanup = useCallback(async () => {
    const capture = captureRef.current;
    const playback = playbackRef.current;
    const session = sessionRef.current;
    captureRef.current = null;
    playbackRef.current = null;
    sessionRef.current = null;

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
   * Verbindung öffnen und aufnehmen. Beides läuft an, während der Benutzer
   * schon spricht — der Verbindungsaufbau fällt damit nicht in die Wartezeit
   * nach dem Loslassen.
   */
  const startTurn = useCallback(
    async (run?: LatencyRun): Promise<void> => {
      // Vor allem anderen und ohne `await` davor: Der Aufruf muss in der
      // Benutzeraktion liegen, sonst bleibt die Wiedergabe stumm. Begründung
      // an `LivePlayback.prime()`.
      const playback = new LivePlayback();
      playback.prime();

      await cleanup();
      playbackRef.current = playback;

      const open = async () => {
        const { token, model, error, detail } = await createLiveToken();
        if (!token || !model) {
          throw new Error(`Live-Token nicht verfügbar (${error}${detail ? `: ${detail}` : ''})`);
        }
        modelRef.current = model;
        return connectLiveSession(token, model);
      };
      const session = await (run ? run.phase('sitzung öffnen', open) : open());
      sessionRef.current = session;

      try {
        captureRef.current = await startMicrophoneCapture((chunk) => {
          void session.sendAudioRealtime({ mimeType: 'audio/pcm', data: chunk });
        });
      } catch (error) {
        await cleanup();
        throw error;
      }

      setStatus('listening');
    },
    [cleanup]
  );

  /**
   * Mikrofon zu, Befehl abschließen und die Antwort abwarten. Die Wiedergabe
   * läuft bis zum letzten Ton weiter — deshalb wird die Sitzung erst danach
   * geschlossen.
   */
  const finishTurn = useCallback(
    async (run?: LatencyRun): Promise<AiAssistantResult> => {
      const session = sessionRef.current;
      if (!session) {
        return { success: false, message: 'Keine Live-Sitzung aktiv' };
      }

      // In der Regel die beim Drücken geweckte Wiedergabe. Der Rückfall greift
      // nur, wenn `startTurn` gar nicht gelaufen ist — dann ist Stummheit das
      // kleinere Übel gegenüber einem Absturz.
      const playback = playbackRef.current ?? new LivePlayback();
      playbackRef.current = playback;

      try {
        await captureRef.current?.stop();
        captureRef.current = null;
        run?.mark('mikrofon aus');

        // Damit in der Konsole steht, welcher Weg gelaufen ist und mit
        // welchem Modell — die beiden Wege sind sonst nicht zu unterscheiden.
        run?.note({ weg: 'live', modell: modelRef.current ?? 'unbekannt' });

        const contextText = run
          ? run.sync('kontext bauen', () => buildContextText())
          : buildContextText();
        run?.note({ kontextZeichen: contextText.length, ...contextStats() });

        setStatus('analyzing');
        await session.send([{ text: contextText }, { text: VOICE_TURN_PROMPT }], true);

        const result = await runLiveTurn({
          messages: session.receive(),
          executeTool,
          sendFunctionResponses: (responses) => session.sendFunctionResponses(responses),
          onAudio: (base64Pcm) => playback.enqueue(base64Pcm),
          onInterrupt: () => playback.interrupt(),
          onStatus: setStatus,
          run,
        });

        // Erst wenn der letzte Block gespielt ist, darf die Wiedergabe
        // abgebaut werden — sonst bricht die Antwort mitten im Satz ab.
        await playback.whenDrained();
        return result;
      } catch (error) {
        console.error('[AI] Live-Sitzung fehlgeschlagen:', error);
        return { success: false, message: 'Sprachbefehl konnte nicht verarbeitet werden' };
      } finally {
        await cleanup();
        setStatus('idle');
      }
    },
    [buildContextText, cleanup, contextStats, executeTool]
  );

  /** Abbruch ohne Antwort, etwa wenn die Aufnahme gar nicht erst zustande kam. */
  const abortTurn = useCallback(async () => {
    await cleanup();
    setStatus('idle');
  }, [cleanup]);

  return {
    /** Ob die Umgebung Live-Audio überhaupt unterstützt (Web Audio, AudioWorklet). */
    isSupported: isLiveAudioSupported(),
    status,
    startTurn,
    finishTurn,
    abortTurn,
    undoLastAction,
    lastCreatedItem,
  };
}
