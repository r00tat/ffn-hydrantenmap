/**
 * Die Darstellungsregeln der 3D-Ansicht.
 *
 * Ohne three und ohne React, damit sie für sich prüfbar sind — dieselbe
 * Trennung wie bei `hoehenlinien.ts`.
 */

/**
 * Kantenlänge der Textur in Pixeln.
 *
 * 4096 ist auf manchen Tablets schon die Treibergrenze; 2048 sind 64 Kacheln
 * und damit ein Ausschnitt, der noch in einem Zug geladen ist.
 */
export const MAX_TEXTURE_PX = 2048;

/**
 * Budget für kleine Bildschirme.
 *
 * Das Handy ist kein Zielgerät, soll aber nicht kaputt sein. Ein Viertel der
 * Vertices und die halbe Texturkante halten Speicher und Bildrate im Rahmen,
 * ohne die Bedienung zu ändern.
 */
export const isSmallScreen = (widthPx: number): boolean => widthPx < 600;

export const meshBudget = (widthPx: number): number =>
  isSmallScreen(widthPx) ? 16_384 : 65_536;

export const texturePx = (widthPx: number): number =>
  isSmallScreen(widthPx) ? MAX_TEXTURE_PX / 2 : MAX_TEXTURE_PX;

/** Startneigung der Kamera. Bei 0° wäre die Szene von der Karte nicht zu unterscheiden. */
export const START_PITCH_DEG = 55;
export const MIN_PITCH_DEG = 10;
export const MAX_PITCH_DEG = 85;

/** Stufen des Reglers. */
export const EXAGGERATION_MIN = 1;
export const EXAGGERATION_MAX = 6;
export const EXAGGERATION_STEP = 0.5;

/**
 * Anteil der Ausschnittsbreite, den das Relief einnehmen soll.
 *
 * Grundlage der Vorgabe für die Überhöhung. 10 % ist der Wert, bei dem ein
 * Hang als Hang gelesen wird, ohne dass die Szene zur Wand wird.
 */
const TARGET_RELIEF_SHARE = 0.1;

/**
 * Die Überhöhung, mit der die Ansicht öffnet.
 *
 * Sie kommt aus dem Relief des Ausschnitts und nicht aus einem Festwert —
 * dieselbe Entscheidung wie bei der Farbrampe der Höhenlinien, und aus
 * demselben Grund: gemessen deckt ein Quadratkilometer Seewinkel 5,7 m ab, der
 * Wagram 58,7 m. Ein fester Faktor macht das eine zur Platte oder das andere
 * zur Wand.
 *
 * Der Preis ist, dass derselbe Hang in zwei Ausschnitten verschieden steil
 * aussieht. Deshalb ist der Faktor im Bild angeschrieben — ohne die Angabe
 * liest man Steigungen falsch, und zwar überzeugt.
 */
export function chooseExaggeration(spanM: number, widthM: number): number {
  if (!(spanM > 0) || !(widthM > 0)) return EXAGGERATION_MIN;
  const wanted = (TARGET_RELIEF_SHARE * widthM) / spanM;
  const stepped = Math.round(wanted / EXAGGERATION_STEP) * EXAGGERATION_STEP;
  return Math.min(EXAGGERATION_MAX, Math.max(EXAGGERATION_MIN, stepped));
}

/** Höhe der Marken über dem Gelände, vor der Überhöhung. */
export const markerLiftM = (widthM: number): number =>
  Math.max(8, widthM * 0.015);

/** Abstand der Leitungen und Höhenlinien von der Geländehaut. */
export const LINE_LIFT_M = 0.5;
