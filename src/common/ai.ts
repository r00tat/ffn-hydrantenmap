/**
 * Shared AI/Gemini configuration constants.
 * Update the model name here to change it for both client and server.
 */
export const GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Modell der Live-Sitzung des Sprach-Assistenten.
 *
 * Nicht dasselbe Modell und nicht dasselbe Backend wie oben: Die Live-API
 * führt eigene Modellnamen, und für Gemini 3 gibt es sie nur über die Gemini
 * Developer API. Siehe [docs/ai-sprachassistent.md](../../docs/ai-sprachassistent.md).
 */
export const GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
