import 'server-only';

import { SchemaType, VertexAI } from '@google-cloud/vertexai';

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
 * Get the Google Cloud project ID from GOOGLE_SERVICE_ACCOUNT environment variable
 */
function getProjectId(): string {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT environment variable is not set. ' +
        'Please provide the service account JSON credentials.'
    );
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (!serviceAccount.project_id) {
      throw new Error(
        'project_id not found in GOOGLE_SERVICE_ACCOUNT credentials'
      );
    }
    return serviceAccount.project_id;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        'Failed to parse GOOGLE_SERVICE_ACCOUNT as JSON. ' +
          'Ensure it contains valid JSON credentials.'
      );
    }
    throw error;
  }
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
function getVertexAI(): VertexAI {
  if (!vertexAIInstance) {
    const projectId = getProjectId();
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
function getGeminiModel() {
  return getVertexAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
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

  const model = getGeminiModel();
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
