import { Content, Part } from 'firebase/ai';

/**
 * Platzhalter für einen Anhang, der aus der Historie entfernt wurde. Der
 * Beitrag bleibt als Benutzerbeitrag erhalten — nur die Nutzdaten fallen weg.
 */
const AUDIO_PLACEHOLDER = '[Sprachbefehl]';

/**
 * Anhänge aus der Historie entfernen.
 *
 * Der gesprochene Befehl geht als Audio direkt an das Modell (Issue #740, ein
 * Roundtrip weniger). In der Historie darf er nicht bleiben: Sie wird bei jeder
 * Folgefrage komplett mitgeschickt, und ein Sprachbefehl von zwölf Sekunden ist
 * rund 200 KB — nach drei Befehlen wäre die Audio-Last größer als der gesamte
 * übrige Kontext.
 */
export function stripInlineDataParts(contents: Content[]): Content[] {
  return contents.map((content) => {
    if (!content.parts.some((part) => 'inlineData' in part && part.inlineData)) {
      return content;
    }
    return {
      ...content,
      parts: content.parts.map((part): Part =>
        'inlineData' in part && part.inlineData ? { text: AUDIO_PLACEHOLDER } : part
      ),
    };
  });
}
