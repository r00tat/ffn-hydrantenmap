'use client';

/**
 * Die Regeln des Höhenlinien-Layers, ohne React und Leaflet.
 *
 * Herausgelöst, damit die Äquidistanz-Staffel und die Strichstärken für sich
 * prüfbar sind: sie entscheiden darüber, ob die Karte lesbar bleibt, und das
 * ist keine Frage, die ein Rendertest gut beantwortet.
 */

export const HOEHENLINIEN_LAYER_NAME = 'Höhenlinien';

/** Unter diesem Schlüssel steht die manuelle Wahl im `localStorage`. */
export const EQUIDISTANCE_STORAGE_KEY = 'hydrantenmap.hoehenlinien.aequidistanz';

export const EQUIDISTANCE_CHOICES = [
  'auto',
  '0.5',
  '1',
  '2',
  '5',
  '10',
] as const;
export type EquidistanceChoice = (typeof EQUIDISTANCE_CHOICES)[number];

/**
 * Äquidistanz nach Zoomstufe.
 *
 * Die Staffel folgt dem, was auf dem Bildschirm noch zu unterscheiden ist:
 * 0,5 m auf Zoom 18 sind im Flachland des Seewinkels bereits enge Linien,
 * dieselbe Äquidistanz auf Zoom 14 wäre eine schwarze Fläche.
 */
export function equidistanceForZoom(zoom: number): number {
  if (zoom >= 18) return 0.5;
  if (zoom >= 17) return 1;
  if (zoom >= 16) return 2;
  if (zoom >= 15) return 5;
  return 10;
}

/** Die tatsächlich verwendete Äquidistanz aus Wahl und Zoomstufe. */
export function resolveEquidistance(
  choice: EquidistanceChoice,
  zoom: number
): number {
  return choice === 'auto' ? equidistanceForZoom(zoom) : Number(choice);
}

/** Die gespeicherte Wahl, oder `'auto'` — auch bei unbrauchbarem Inhalt. */
export function readEquidistanceChoice(): EquidistanceChoice {
  if (typeof window === 'undefined') return 'auto';
  const stored = window.localStorage.getItem(EQUIDISTANCE_STORAGE_KEY);
  return EQUIDISTANCE_CHOICES.includes(stored as EquidistanceChoice)
    ? (stored as EquidistanceChoice)
    : 'auto';
}

/**
 * Strichstärke einer Höhenlinie.
 *
 * Vollmeterlinien stärker als Zwischenlinien: bei 0,5 m Äquidistanz stünde
 * sonst ein Bündel gleich starker Linien da, in dem keine Höhe mehr ablesbar
 * ist. Dasselbe Mittel wie auf jeder topografischen Karte.
 */
export function contourWeight(heightM: number): number {
  return Number.isInteger(heightM) ? 1.5 : 0.75;
}

/** Ob eine Linie beschriftet und hervorgehoben wird. */
export const isIndexContour = (heightM: number): boolean =>
  Number.isInteger(heightM);
