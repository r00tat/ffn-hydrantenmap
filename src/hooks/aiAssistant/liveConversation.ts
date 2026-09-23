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

/** Was `LiveConnection.receive()` liefert. */
export type LiveMessage =
  | LiveServerContent
  | LiveServerToolCall
  | LiveServerToolCallCancellation
  | LiveServerGoingAwayNotice
  | LiveSessionResumptionUpdate;

/**
 * Woran der Assistent gerade ist. `speaking` ist neu gegenüber dem früheren
 * Einzelbefehl: Im Gespräch ist das ein eigener, sichtbarer Zustand, weil man
 * dem Modell ins Wort fallen darf.
 */
export type LiveConversationStatus = 'listening' | 'executing' | 'speaking';

export interface LiveConversationDeps {
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
  onStatus?: (status: LiveConversationStatus) => void;
  /** Die Abschrift der Antwort, während sie entsteht. */
  onPartialAnswer?: (text: string) => void;
  /** Die Abschrift dessen, was der Benutzer gerade sagt. */
  onHeard?: (text: string) => void;
  /** Ein Beitrag des Modells ist abgeschlossen. */
  onTurn?: (result: AiAssistantResult) => void;
  /** Die Sitzung ist zu Ende — der Strom ist versiegt. */
  onEnd?: () => void;
}

/**
 * Das laufende Gespräch der Live-Sitzung: viele Sprecherwechsel, eine
 * Verbindung.
 *
 * Der Vorgänger (`runLiveTurn`) bearbeitete genau einen Befehl und gab dessen
 * Ergebnis zurück. Das ging nicht auf: Die Sprechpausenerkennung des Servers
 * schließt den Sprecherwechsel selbst, sobald der Sprecher Luft holt, und
 * antwortet sofort. In einer gemessenen Sitzung lag die vollständige Antwort
 * samt `turnComplete` bereits in der Warteschlange, **bevor** der Browser den
 * Knopf losgelassen hatte — die Tonblöcke erreichten die Wiedergabe erst beim
 * Loslassen, und die Antwort auf den erst dann nachgereichten Kartenkontext
 * fiel als zweiter Sprecherwechsel unter den Tisch.
 *
 * Deshalb hier kein Rückgabewert, sondern Rückrufe: Was ankommt, wird gemeldet,
 * sobald es ankommt, und die Schleife läuft weiter, bis die Sitzung endet. Der
 * Kartenkontext geht einmal zu Beginn hinaus (siehe `useAiLiveAssistant`) und
 * ist damit da, wenn das Modell sein Werkzeug wählt.
 *
 * Bewusst ohne Audio- und Sitzungsverwaltung: Was hier steht, ist reine
 * Protokolllogik und damit ohne Browser prüfbar. Mikrofon und Wiedergabe
 * liegen in `liveAudio.ts`.
 *
 * Hintergrund: [docs/ai-sprachassistent.md](../../../docs/ai-sprachassistent.md)
 */
export async function runLiveConversation({
  messages,
  executeTool,
  sendFunctionResponses,
  onAudio,
  onInterrupt,
  onStatus,
  onPartialAnswer,
  onHeard,
  onTurn,
  onEnd,
}: LiveConversationDeps): Promise<void> {
  onStatus?.('listening');

  /** Die Abschrift der laufenden Antwort; sie kommt in Bruchstücken. */
  let transcript = '';
  /** Die Abschrift des laufenden Beitrags des Benutzers. */
  let heard = '';
  let lastToolResult: AiAssistantResult | null = null;
  let drafts: AiAssistantResult['drafts'];
  let spoken = false;
  /**
   * Ein Werkzeugaufruf beendet den laufenden Sprecherwechsel; das Modell
   * spricht erst im nächsten. Dieses `turnComplete` ist also kein Beitrag und
   * darf nichts melden — sonst käme zu jedem Werkzeug eine stumme Meldung ohne
   * Text. Es gilt nur einmal: Bleibt das Modell auch danach still, ist das
   * Werkzeugergebnis die Antwort.
   */
  let toolTurnPending = false;

  for await (const message of messages) {
    if (message.type === 'serverContent') {
      const content = message as LiveServerContent;

      if (content.interrupted) {
        onInterrupt?.();
      }

      for (const part of content.modelTurn?.parts ?? []) {
        const inlineData = 'inlineData' in part ? part.inlineData : undefined;
        if (inlineData?.mimeType.startsWith('audio/')) {
          if (!spoken) {
            onStatus?.('speaking');
          }
          spoken = true;
          onAudio?.(inlineData.data);
        }
      }

      if (content.inputTranscription?.text) {
        heard += content.inputTranscription.text;
        onHeard?.(heard);
      }

      if (content.outputTranscription?.text) {
        transcript += content.outputTranscription.text;
        onPartialAnswer?.(transcript);
      }

      if (content.turnComplete) {
        if (toolTurnPending && !transcript) {
          toolTurnPending = false;
          console.info('[AI-Live] Werkzeug-Turn beendet, warte auf die Antwort');
          continue;
        }
        toolTurnPending = false;
        finishTurn();
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
        const result = await executeTool(call);
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
      toolTurnPending = true;
      continue;
    }

    // `toolCallCancellation`, `goingAwayNotice` und `sessionResumptionUpdate`
    // ändern am laufenden Beitrag nichts; die Sitzung eines Gesprächs am
    // Einsatzort ist kurz genug, dass eine Wiederaufnahme sich nicht lohnt.
  }

  // Der Strom ist versiegt — entweder hat der Benutzer das Gespräch beendet
  // oder die Verbindung ist abgerissen. Was bis hierher geschehen ist, ist
  // geschehen: Ein angelegtes Fahrzeug steht in Firestore, auch wenn der
  // abschließende `turnComplete` nie kam.
  if (transcript || lastToolResult) {
    finishTurn();
  }
  onEnd?.();

  function finishTurn(): void {
    const message = transcript.trim();
    console.info('[AI-Live] verstanden:', JSON.stringify(heard.trim()));
    console.info('[AI-Live] Antwort:', JSON.stringify(message), { gesprochen: spoken });

    if (message || lastToolResult) {
      onTurn?.({
        success: true,
        message: message || lastToolResult?.message || 'Aktion ausgeführt',
        isAnswer: !!message,
        createdItemId: lastToolResult?.createdItemId,
        drafts,
        // Das Modell spricht selbst; eine zweite Ausgabe über die
        // Sprachsynthese des Browsers würde den Satz doppelt bringen.
        spokenByModel: spoken,
      });
    }

    transcript = '';
    heard = '';
    lastToolResult = null;
    drafts = undefined;
    spoken = false;
    onStatus?.('listening');
  }
}
