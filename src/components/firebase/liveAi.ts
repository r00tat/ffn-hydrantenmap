import {
  getAI,
  getLiveGenerativeModel,
  GoogleAIBackend,
  LiveGenerativeModel,
  ResponseModality,
} from 'firebase/ai';
import firebaseApp from './firebase';
import { GEMINI_LIVE_MODEL } from '../../common/ai';
import { AI_SYSTEM_PROMPT, AI_TOOL_DECLARATIONS } from './aiTools';

/**
 * Modell der Live-Sitzung — bewusst ein anderes Backend als
 * [vertexai.ts](./vertexai.ts).
 *
 * Die Live-API gibt es für Gemini 3 ausschließlich über die Gemini Developer
 * API (`GoogleAIBackend`); das Agent-Platform-Backend, über das der übrige
 * Assistent läuft, führt nur die 2.5er-Live-Modelle. Beide Backends dürfen
 * nebeneinander bestehen: `getAI` schlüsselt seine Instanz je Backend.
 *
 * Voraussetzung im Firebase-Projekt ist die zusätzlich freigeschaltete
 * `generativelanguage.googleapis.com`; fehlt sie, scheitert `connect()` und
 * der Assistent fällt auf den Einzelaufruf zurück (siehe
 * [docs/ai-sprachassistent.md](../../../docs/ai-sprachassistent.md)).
 */
let liveModel: LiveGenerativeModel | undefined;

export function getAiLiveModel(): LiveGenerativeModel {
  if (!liveModel) {
    const liveAi = getAI(firebaseApp, { backend: new GoogleAIBackend() });
    liveModel = getLiveGenerativeModel(liveAi, {
      model: GEMINI_LIVE_MODEL,
      systemInstruction: AI_SYSTEM_PROMPT,
      tools: [{ functionDeclarations: AI_TOOL_DECLARATIONS }],
      generationConfig: {
        responseModalities: [ResponseModality.AUDIO],
        // Ohne Abschrift bliebe von der Antwort nur Ton: Der Toast, das
        // Einsatztagebuch-Protokoll und die Rückfrage-Optionen brauchen den
        // Text.
        outputAudioTranscription: {},
        // Was das Modell verstanden hat, ist die einzige Kontrolle darüber,
        // ob der Sprachbefehl richtig angekommen ist — im Einzelaufruf steht
        // das in den Werkzeugargumenten, hier sonst nirgends.
        inputAudioTranscription: {},
      },
    });
  }
  return liveModel;
}
