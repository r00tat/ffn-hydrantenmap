import { LiveSession } from 'firebase/ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAiLiveModel } from '../../components/firebase/liveAi';
import { FirecallItem } from '../../components/firebase/firestore';
import { LatencyRun } from './latency';
import {
  isLiveAudioSupported,
  LivePlayback,
  MicrophoneCapture,
  startMicrophoneCapture,
} from './liveAudio';
import { runLiveTurn } from './liveTurn';
import { AiAssistantResult } from './types';
import useAiToolRunner from './useAiToolRunner';

export type AiLiveStatus = 'idle' | 'listening' | 'analyzing' | 'executing';

/**
 * Derselbe Satz wie beim Einzelaufruf: Er schließt den Sprecherwechsel ab und
 * sagt dem Modell, was mit dem Gehörten zu tun ist. Ohne ihn müsste die
 * Sprecherkennung des Servers das Ende der Rede selbst erkennen — bei einem
 * abrupt abgeschalteten Mikrofon hört sie aber keine Stille, sondern nichts
 * mehr.
 */
const LIVE_TURN_PROMPT = 'Das Gesagte ist der Befehl des Benutzers. Führe ihn aus.';

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

  const sessionRef = useRef<LiveSession | null>(null);
  const captureRef = useRef<MicrophoneCapture | null>(null);
  const playbackRef = useRef<LivePlayback | null>(null);
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
      await cleanup();

      const model = getAiLiveModel();
      const session = await (run
        ? run.phase('sitzung öffnen', () => model.connect())
        : model.connect());
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

      const playback = new LivePlayback();
      playbackRef.current = playback;

      try {
        await captureRef.current?.stop();
        captureRef.current = null;
        run?.mark('mikrofon aus');

        const contextText = run
          ? run.sync('kontext bauen', () => buildContextText())
          : buildContextText();
        run?.note({ kontextZeichen: contextText.length, ...contextStats() });

        setStatus('analyzing');
        await session.send([{ text: contextText }, { text: LIVE_TURN_PROMPT }], true);

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
