import {
  FunctionCall,
  FunctionResponse,
  LiveServerContent,
  LiveServerGoingAwayNotice,
  LiveServerToolCall,
  LiveServerToolCallCancellation,
  LiveSessionResumptionUpdate,
} from 'firebase/ai';
import { AiAssistantResult } from './types';
import { LatencyRun } from './latency';

/** Was `LiveSession.receive()` liefert. */
export type LiveMessage =
  | LiveServerContent
  | LiveServerToolCall
  | LiveServerToolCallCancellation
  | LiveServerGoingAwayNotice
  | LiveSessionResumptionUpdate;

export interface LiveTurnDeps {
  /** Nachrichtenstrom der offenen Sitzung. */
  messages: AsyncGenerator<LiveMessage>;
  /** Führt einen Werkzeugaufruf aus — derselbe Weg wie beim Einzelaufruf. */
  executeTool: (call: FunctionCall) => Promise<AiAssistantResult>;
  /** Schickt die Werkzeugergebnisse zurück in die Sitzung. */
  sendFunctionResponses: (responses: FunctionResponse[]) => Promise<void>;
  /** Tonausgabe des Modells (16-bit PCM, 24 kHz, base64) zur Wiedergabe. */
  onAudio?: (base64Pcm: string) => void;
  /** Das Modell wurde unterbrochen — bereits geplante Wiedergabe verwerfen. */
  onInterrupt?: () => void;
  /** Statuswechsel für die Anzeige am Button. */
  onStatus?: (status: 'analyzing' | 'executing') => void;
  run?: LatencyRun;
}

/**
 * Ein Sprecherwechsel („Turn") der Live-Sitzung, von der ersten Servernachricht
 * bis `turnComplete`.
 *
 * Das ist das Gegenstück zur Schleife in `useAiAssistant.sendToGemini`, nur
 * umgedreht: Dort fragt der Browser das Modell wiederholt und wertet jede
 * Antwort aus, hier kommen die Nachrichten von selbst und der Browser
 * antwortet nur noch auf Werkzeugaufrufe. Ein Zähler für Schleifendurchläufe
 * braucht es deshalb nicht mehr — das Ende bestimmt der Server.
 *
 * Bewusst ohne Audio- und Sitzungsverwaltung: Was hier steht, ist reine
 * Protokolllogik und damit ohne Browser prüfbar. Mikrofon und Wiedergabe
 * liegen in `liveAudio.ts`.
 */
export async function runLiveTurn({
  messages,
  executeTool,
  sendFunctionResponses,
  onAudio,
  onInterrupt,
  onStatus,
  run,
}: LiveTurnDeps): Promise<AiAssistantResult> {
  onStatus?.('analyzing');

  // Die Abschrift kommt in Bruchstücken („Das TLFA " / "ist eingetragen.") und
  // wird erst am Ende ein Satz.
  let transcript = '';
  /**
   * Was das Modell aus dem Ton verstanden hat. Wird nicht zurückgegeben, aber
   * protokolliert: Es ist die einzige Stelle, an der sich ein Fehlgriff bei der
   * Werkzeugwahl von einem Hörfehler unterscheiden lässt. Ist sie leer, hat das
   * Modell den gesprochenen Satz gar nicht bekommen.
   */
  let heard = '';
  let lastToolResult: AiAssistantResult | null = null;
  let drafts: AiAssistantResult['drafts'];
  let spoken = false;
  let firstChunk = true;

  /**
   * Offene Sprecherwechsel. Beginnt bei eins — dem Turn, den der Browser mit
   * seinem Beitrag eröffnet hat.
   *
   * Warum das zählen muss: Ein Werkzeugaufruf **beendet** den laufenden Turn.
   * Das Modell spricht erst im nächsten, den unsere Werkzeugantwort eröffnet.
   * An einer echten Sitzung gemessen:
   *
   *   1203 ms  toolCall
   *   1205 ms  turnComplete        ← nur das Ende des Werkzeug-Turns
   *   1905 ms  erster Ton samt Abschrift
   *   5617 ms  turnComplete        ← das echte Ende
   *
   * Wer beim ersten `turnComplete` aussteigt, liefert jedes Mal, wenn ein
   * Werkzeug lief, eine stumme Antwort ohne Abschrift — und weil ohne
   * Abschrift `isAnswer` falsch ist, spricht auch die Sprachsynthese des
   * Browsers nicht ein.
   */
  let openTurns = 1;

  for await (const message of messages) {
    if (message.type === 'serverContent') {
      const content = message as LiveServerContent;

      if (content.interrupted) {
        onInterrupt?.();
      }

      for (const part of content.modelTurn?.parts ?? []) {
        const inlineData = 'inlineData' in part ? part.inlineData : undefined;
        if (inlineData?.mimeType.startsWith('audio/')) {
          if (firstChunk) {
            run?.mark('erster ton');
            firstChunk = false;
          }
          spoken = true;
          onAudio?.(inlineData.data);
        }
      }

      if (content.inputTranscription?.text) {
        heard += content.inputTranscription.text;
      }

      if (content.outputTranscription?.text) {
        transcript += content.outputTranscription.text;
      }

      if (content.turnComplete) {
        openTurns -= 1;
        if (openTurns <= 0) {
          run?.mark('turn abgeschlossen');
          console.info('[AI-Live] Turn beendet');
          return buildResult();
        }
        run?.mark('werkzeug-turn beendet');
        console.info('[AI-Live] Werkzeug-Turn beendet, warte auf die Antwort');
      }
      continue;
    }

    if (message.type === 'toolCall') {
      const { functionCalls } = message as LiveServerToolCall;
      onStatus?.('executing');

      console.info(
        '[AI-Live] Werkzeugaufrufe:',
        functionCalls.map((call) => ({ name: call.name, args: call.args })),
      );

      const responses: FunctionResponse[] = [];
      for (const call of functionCalls) {
        const result = await (run
          ? run.phase(`werkzeug ${call.name}`, () => executeTool(call))
          : executeTool(call));
        console.info(`[AI-Live] Werkzeugergebnis (${call.name}):`, {
          success: result.success,
          message: result.message,
        });
        lastToolResult = result;
        if (result.drafts) {
          drafts = result.drafts;
        }
        responses.push({ name: call.name, response: { result } });
      }

      await sendFunctionResponses(responses);
      // Die Werkzeugantwort eröffnet den Sprecherwechsel, in dem das Modell
      // seine Antwort spricht. Bis dahin steht noch ein `turnComplete` aus,
      // das nur den Werkzeug-Turn schließt.
      openTurns += 1;
      onStatus?.('analyzing');
      continue;
    }

    // `toolCallCancellation`, `goingAwayNotice` und
    // `sessionResumptionUpdate` betreffen einen kurzen Sprachbefehl nicht:
    // Die Sitzung lebt nur für diesen einen Turn, und abgebrochene
    // Werkzeugaufrufe gibt es mangels paralleler Ausführung keine.
  }

  // Ohne `turnComplete` ist die Verbindung mitten im Turn abgerissen. Was
  // bereits geschehen ist, ist trotzdem geschehen — ein angelegtes Fahrzeug
  // steht in Firestore und darf dem Benutzer nicht als Fehlschlag gemeldet
  // werden.
  return buildResult();

  function buildResult(): AiAssistantResult {
    const message = transcript.trim();
    // Die eine Zeile, die den Fall erklärt: Steht hinter „verstanden" nichts,
    // ist der Ton nicht angekommen — dann ist jede Werkzeugwahl geraten.
    console.info('[AI-Live] verstanden:', JSON.stringify(heard.trim()));
    console.info('[AI-Live] Antwort:', JSON.stringify(message), { gesprochen: spoken });
    if (!message && !lastToolResult) {
      return { success: false, message: 'Sprachbefehl konnte nicht verarbeitet werden' };
    }
    return {
      success: true,
      message: message || lastToolResult?.message || 'Aktion ausgeführt',
      isAnswer: !!message,
      createdItemId: lastToolResult?.createdItemId,
      drafts,
      // Das Modell spricht selbst; eine zweite Ausgabe über die
      // Sprachsynthese des Browsers würde den Satz doppelt bringen.
      spokenByModel: spoken,
    };
  }
}
