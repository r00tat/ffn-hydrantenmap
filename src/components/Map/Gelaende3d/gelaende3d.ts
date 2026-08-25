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

/**
 * Sicherheitszuschlag beim Einpassen.
 *
 * Die Kugel um die Szene wird knapp gerechnet; ohne den Zuschlag stößt das
 * Gelände genau an den Bildrand.
 */
const FRAME_MARGIN = 1.08;

export interface CameraFraming {
  /** Abstand der Kamera vom Zielpunkt. */
  distance: number;
  /** Höhe des Zielpunkts — die Mitte des **überhöhten** Geländes. */
  centerY: number;
  near: number;
  far: number;
}

/**
 * Die Kamera so setzen, dass der ganze Ausschnitt im Bild ist.
 *
 * Zwei Dinge müssen dabei zusammenkommen, und beide wurden anfangs übersehen:
 *
 * - **Das Gelände liegt nicht bei y = 0.** Die Höhen sind absolut (im
 *   Einsatzgebiet 106 bis 882 m). Eine Kamera, deren Höhe aus dem Abstand
 *   allein kommt, steht bei einem kleinen Ausschnitt **im** Gelände — das Bild
 *   ist dann schwarz, und es hilft nur Herauszoomen.
 * - **Die Überhöhung zählt mit.** Sie streckt die Szene um bis zum Sechsfachen;
 *   eine Einpassung auf die unverzerrte Höhe wäre danach zu eng.
 *
 * Gerechnet wird über die umschließende Kugel und den engeren der beiden
 * Öffnungswinkel — bei einem breiten Fenster begrenzt der senkrechte, bei einem
 * hohen der waagrechte.
 */
export function cameraFraming(
  widthM: number,
  depthM: number,
  minM: number,
  maxM: number,
  exaggeration: number,
  fovDeg: number,
  aspect: number
): CameraFraming {
  const spanY = Math.max(0, maxM - minM) * exaggeration;
  const centerY = ((minM + maxM) / 2) * exaggeration;
  const radius = Math.max(1, 0.5 * Math.hypot(widthM, depthM, spanY));

  const vFov = (fovDeg * Math.PI) / 180;
  const safeAspect = aspect > 0 ? aspect : 1;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
  const fov = Math.min(vFov, hFov);

  const distance = (radius / Math.sin(fov / 2)) * FRAME_MARGIN;
  return {
    distance,
    centerY,
    // Die Nahebene mit dem Abstand mitwachsen lassen: fest auf 1 gesetzt
    // flimmert ein weit gezogener Ausschnitt im Tiefenpuffer.
    near: Math.max(0.1, distance / 2000),
    far: (distance + radius) * 4,
  };
}
