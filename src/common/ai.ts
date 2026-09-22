/**
 * Shared AI/Gemini configuration constants.
 * Update the model name here to change it for both client and server.
 */
export const GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Modell der Live-Sitzung des Sprach-Assistenten.
 *
 * Nicht dasselbe Modell und nicht derselbe Dienst wie oben: Die Live-API führt
 * eigene Modellnamen, und für Gemini 3 gibt es sie nur über die Gemini
 * Developer API — angesprochen wird sie direkt, mit einem kurzlebigen Token
 * statt eines API-Keys.
 *
 * Der Name geht ausschließlich serverseitig in das Token ein; der Browser kann
 * ihn nicht überschreiben. Googles Modelliste führt inzwischen zusätzlich
 * `gemini-3.8-live` als Vorgabe der Developer API — ein Wechsel ist diese eine
 * Zeile, sollte aber gegen eine echte Sitzung geprüft werden.
 *
 * Siehe [docs/ai-sprachassistent.md](../../docs/ai-sprachassistent.md).
 */
export const GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
