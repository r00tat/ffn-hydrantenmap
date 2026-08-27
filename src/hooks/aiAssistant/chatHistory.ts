import { Content, Part } from 'firebase/ai';

/**
 * Platzhalter für einen Anhang, der aus der Historie entfernt wurde. Der
 * Beitrag bleibt als Benutzerbeitrag erhalten — nur die Nutzdaten fallen weg.
 */
const AUDIO_PLACEHOLDER = '[Sprachbefehl]';

/** Einleitung des Kartenkontexts im Benutzerbeitrag. */
export const MAP_CONTEXT_PREFIX = 'Aktueller Map-Kontext:';

/** Bleibt stehen, wenn ein Beitrag sonst ohne Teile dastünde. */
const CONTEXT_PLACEHOLDER = '[Kartenkontext]';

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

/**
 * Kartenkontext aus der Historie entfernen.
 *
 * Jeder Benutzerbeitrag trägt den vollständigen Kartenstand — bei 27 Elementen
 * rund 2000 Token. In der Historie summiert sich das: Die Messung zu #740 zeigt
 * nach vier Befehlen 17.854 statt 9.852 Prompt-Token, und die Antwortzeit
 * wächst mit. Der Kontext des *aktuellen* Beitrags geht ohnehin bei jeder
 * Anfrage frisch mit und ist dem alten Stand in jeder Hinsicht voraus.
 */
export function stripMapContextParts(contents: Content[]): Content[] {
  return contents.map((content) => {
    const isContext = (part: Part) =>
      'text' in part && typeof part.text === 'string' && part.text.startsWith(MAP_CONTEXT_PREFIX);
    if (!content.parts.some(isContext)) {
      return content;
    }
    const parts = content.parts.filter((part) => !isContext(part));
    return {
      ...content,
      parts: parts.length > 0 ? parts : [{ text: CONTEXT_PLACEHOLDER }],
    };
  });
}
