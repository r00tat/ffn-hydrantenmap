import 'server-only';

import { SchemaType, VertexAI } from '@google-cloud/vertexai';
import { GEMINI_MODEL } from '../../common/ai';
import { getGcpProjectId } from '../firebase/project';

/**
 * Einsatz data structure extracted from alarm dispatch emails
 */
export interface Einsatz {
  einsatzstichwort: string; // e.g., "Unwetter (Tech55)"
  einsatzzielAdresse: string; // Full address
  meldender: string;
  meldenderTelefon?: string;
  prioritaet: string;
  ressourcen: string;
  sachverhalt: string; // e.g., "Wasser im Keller"
  zeitpunkt: string;
  auftragsNummer: string;
}

/**
 * Get Google Auth options from service account credentials
 */
function getGoogleAuthOptions() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return undefined;
  }

  try {
    const credentials = JSON.parse(serviceAccountJson);
    return { credentials };
  } catch {
    return undefined;
  }
}

// Lazy-initialized Vertex AI client
let vertexAIInstance: VertexAI | null = null;

/**
 * Get the Vertex AI client instance, initializing it on first use.
 * This avoids errors at module load time if environment variables are not set.
 */
async function getVertexAI(): Promise<VertexAI> {
  if (!vertexAIInstance) {
    const projectId = await getGcpProjectId();
    vertexAIInstance = new VertexAI({
      project: projectId,
      location: 'europe-west1',
      googleAuthOptions: getGoogleAuthOptions(),
    });
  }
  return vertexAIInstance;
}

// Response schema for structured JSON output
const einsatzResponseSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      einsatzstichwort: {
        type: SchemaType.STRING,
        description: 'Einsatzstichwort, z.B. "Unwetter (Tech55)"',
        nullable: false,
      },
      einsatzzielAdresse: {
        type: SchemaType.STRING,
        description: 'Vollständige Adresse des Einsatzziels',
        nullable: false,
      },
      meldender: {
        type: SchemaType.STRING,
        description: 'Name des Meldenden',
        nullable: false,
      },
      meldenderTelefon: {
        type: SchemaType.STRING,
        description: 'Telefonnummer des Meldenden',
        nullable: true,
      },
      prioritaet: {
        type: SchemaType.STRING,
        description: 'Priorität des Einsatzes',
        nullable: false,
      },
      ressourcen: {
        type: SchemaType.STRING,
        description: 'Eingesetzte Ressourcen/Fahrzeuge',
        nullable: false,
      },
      sachverhalt: {
        type: SchemaType.STRING,
        description: 'Beschreibung des Sachverhalts, z.B. "Wasser im Keller"',
        nullable: false,
      },
      zeitpunkt: {
        type: SchemaType.STRING,
        description: 'Zeitpunkt der Alarmierung',
        nullable: false,
      },
      auftragsNummer: {
        type: SchemaType.STRING,
        description: 'Auftragsnummer des Einsatzes',
        nullable: false,
      },
    },
    required: [
      'einsatzstichwort',
      'einsatzzielAdresse',
      'meldender',
      'prioritaet',
      'ressourcen',
      'sachverhalt',
      'zeitpunkt',
      'auftragsNummer',
    ],
  },
};

/**
 * Get the Gemini model instance, initializing it on first use.
 */
async function getGeminiModel() {
  return (await getVertexAI()).getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1, // Low temperature for deterministic extraction
      responseMimeType: 'application/json',
      responseSchema: einsatzResponseSchema,
    },
  });
}

/**
 * Extract Einsatz data from HTML content of an alarm dispatch email.
 *
 * @param html - The HTML content from an alarm dispatch email
 * @returns An array of extracted Einsatz objects
 */
export async function extractEinsaetzeFromHtml(html: string): Promise<Einsatz[]> {
  const systemInstruction = `Du bist ein Daten-Extraktions-Assistent für Feuerwehr-Einsatzdaten.
Analysiere das folgende HTML einer Alarmdepesche und extrahiere die Daten für alle enthaltenen Einsätze.
Manche E-Mails können mehrere Einsätze als separate Blöcke enthalten. Extrahiere sie alle.`;

  const request = {
    systemInstruction: {
      role: 'system' as const,
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: 'user' as const,
        parts: [
          {
            text: `Hier ist das HTML:\n${html}`,
          },
        ],
      },
    ],
  };

  const model = await getGeminiModel();
  const result = await model.generateContent(request);
  const response = result.response;

  // Extract text from the response
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.warn('No text response from Gemini model');
    return [];
  }

  try {
    const einsaetze = JSON.parse(text) as Einsatz[];
    return einsaetze;
  } catch (error) {
    console.error('Failed to parse Gemini response as JSON:', error);
    console.error('Raw response:', text);
    return [];
  }
}
