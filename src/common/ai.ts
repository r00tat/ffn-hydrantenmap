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
 * ihn nicht überschreiben.
 *
 * Warum `gemini-3.8-live` und nicht `gemini-3.1-flash-live-preview`: Das ist
 * seit 2026-09-15 das neue Live-Modell der Developer API, „built for scale and
 * cost efficiency". Der ältere Name stammt noch aus der Modelltabelle von
 * Firebase AI Logic, über die diese Sitzung nicht mehr läuft, und trägt
 * `preview` — Preview-Namen werden planmäßig abgeschaltet.
 *
 * Nicht irritieren lassen: `GET /v1beta/models` meldet für beide dieselbe
 * `version` (`3.1-flash-live-03-2026`). Das ist veraltete Metadatenpflege am
 * neuen Eintrag, kein Beleg, dass es derselbe Build ist.
 *
 * `gemini-3.8-live-extended-thinking` gibt es auch — es denkt und spricht
 * gleichzeitig und führt den Speech-to-Speech-Index an. Für einen Sprachbefehl
 * auf der Karte ist mehrstufiges Nachdenken der falsche Tausch: hier zählt die
 * Antwortzeit, und die Aufgabe ist ein Satz und ein Werkzeugaufruf.
 *
 * Siehe [docs/ai-sprachassistent.md](../../docs/ai-sprachassistent.md).
 */
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';

/**
 * Der Satz, der den gesprochenen Beitrag abschließt — in beiden Wegen
 * derselbe, deshalb steht er hier und nicht zweimal in den Hooks.
 *
 * Er hieß einmal „Das Gesagte ist der Befehl des Benutzers. Führe ihn aus."
 * und hat damit jede Frage zum Befehl erklärt. Das Werkzeug `answerQuestion`
 * ist aber beschrieben mit „use this when the user asks a question **rather
 * than giving a command**" — der Abschlusssatz hat es also gerade dann
 * ausgeschlossen, wenn es gebraucht wurde. Übrig blieb `createDiary`, das
 * sich selbst als „DEFAULT action … does not match any other tool" anbietet.
 * „Wie ist die aktuelle Lage?" landete so als Tagebucheintrag statt als
 * Antwort.
 */
export const VOICE_TURN_PROMPT =
  'Das Gesagte ist die Eingabe des Benutzers — eine Anweisung oder eine Frage. ' +
  'Führe eine Anweisung aus. Beantworte eine Frage und lege sie nicht als ' +
  'Tagebucheintrag ab.';
