/**
 * Der Inhalt eines kurzlebigen Live-Tokens („ephemeral token").
 *
 * Warum es das gibt: Die Live-Verbindung ist ein WebSocket, und ein Browser
 * schickt beim Upgrade keinen `Referer`. Die Referrer-Bindung des öffentlichen
 * Browser-Keys greift deshalb nicht — der Handshake wird mit „Requests from
 * referer <empty> are blocked" abgewiesen. Ein Token löst das nicht, indem es
 * die Schranke umgeht, sondern indem gar kein API-Key mehr im Browser liegt:
 * Der Server prägt mit dem geheimen Schlüssel ein Token, das 60 Sekunden lang
 * **eine** Sitzung eröffnen darf, und der Browser bekommt nur dieses.
 *
 * Hier steht nur der reine Bauplan des Tokens, ohne Netz und ohne Firebase —
 * geprägt wird es in [../app/actions/aiLiveToken.ts](../app/actions/aiLiveToken.ts).
 *
 * Hintergrund: [docs/ai-sprachassistent.md](../../docs/ai-sprachassistent.md)
 */

/**
 * Frist zum **Eröffnen** der Sitzung. Der Browser holt das Token beim
 * Tastendruck und verbindet unmittelbar danach; eine Minute ist bereits
 * großzügig und zugleich die Vorgabe der API.
 */
export const LIVE_TOKEN_NEW_SESSION_SECONDS = 60;

/**
 * Frist zum **Senden** in der offenen Sitzung. Ein Sprachbefehl dauert
 * Sekunden; zehn Minuten lassen Luft für eine lange Rede und liegen weit unter
 * der Vorgabe von 30 Minuten.
 */
export const LIVE_TOKEN_EXPIRE_SECONDS = 10 * 60;

/** Die Schema-Typen, die die Live-API in Großschreibung erwartet. */
const SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
]);

/**
 * Schreibt die Schema-Typen der Werkzeugbeschreibungen groß.
 *
 * Nötig, weil zwei Schreibweisen aufeinandertreffen: `SchemaType` des
 * Firebase-SDK führt Kleinbuchstaben (`'object'`), die Live-API der Gemini
 * Developer API erwartet den Enum-Namen (`'OBJECT'`). Über Firebase AI Logic
 * fiel das nie auf, weil dessen Proxy die Umschrift übernimmt — auf dem
 * direkten Weg gibt es den Proxy nicht mehr.
 *
 * Angefasst wird nur ein `type`, dessen Wert eine Zeichenkette **und** ein
 * bekannter Schema-Typ ist. Eine Objekteigenschaft, die selbst `type` heißt —
 * die Positionsangabe der Werkzeuge ist eine —, trägt als Wert ein Objekt und
 * bleibt damit unberührt.
 */
export function normalizeSchemaTypes<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSchemaTypes(entry)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] =
        key === 'type' && typeof entry === 'string' && SCHEMA_TYPES.has(entry)
          ? entry.toUpperCase()
          : normalizeSchemaTypes(entry);
    }
    return result as T;
  }
  return value;
}

/** Aus `gemini-3.8-live` wird `models/gemini-3.8-live`. */
export function liveModelPath(model: string): string {
  return model.startsWith('models/') ? model : `models/${model}`;
}

export interface LiveTokenRequestParams {
  model: string;
  systemInstruction: string;
  /** `AI_TOOL_DECLARATIONS` — die Beschreibungen, nicht die Ausführung. */
  toolDeclarations: unknown[];
  /** Nur für die Tests; sonst die aktuelle Zeit. */
  now?: number;
}

export interface LiveTokenRequest {
  uses: number;
  expireTime: string;
  newSessionExpireTime: string;
  /** Rohes Wire-Format der Live-API — bewusst ungetypt. */
  bidiGenerateContentSetup: Record<string, unknown>;
}

/**
 * Baut den Rumpf für `POST /v1beta/auth_tokens`.
 *
 * Entscheidend ist, was **fehlt**: keine `fieldMask`. Ist ein
 * `bidiGenerateContentSetup` angegeben und keine Maske gesetzt, gilt das Setup
 * des Tokens vollständig und das Setup, das der Browser beim Verbinden
 * schickt, wird verworfen. Modell, Systemanweisung, Werkzeuge und die
 * Ausgabeform liegen damit serverseitig fest — ein veränderter Client kann
 * daran nichts drehen und insbesondere kein teureres Modell wählen.
 */
export function buildLiveTokenRequest({
  model,
  systemInstruction,
  toolDeclarations,
  now = Date.now(),
}: LiveTokenRequestParams): LiveTokenRequest {
  return {
    uses: 1,
    expireTime: new Date(now + LIVE_TOKEN_EXPIRE_SECONDS * 1000).toISOString(),
    newSessionExpireTime: new Date(
      now + LIVE_TOKEN_NEW_SESSION_SECONDS * 1000,
    ).toISOString(),
    bidiGenerateContentSetup: {
      model: liveModelPath(model),
      generationConfig: { responseModalities: ['AUDIO'] },
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      tools: [{ functionDeclarations: normalizeSchemaTypes(toolDeclarations) }],
      // Die Abschriften stehen im Setup und nicht in der `generationConfig`:
      // Das ist die Stelle, an der die öffentliche SDK-Oberfläche vom
      // Wire-Format abweicht.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
}
