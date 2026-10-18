/**
 * Reine Logik der Mehrfachauswahl auf der Karte: was in einem Rahmen liegt,
 * was überhaupt wählbar ist und wie eine Verschiebung die Felder eines
 * Elements ändert. Ohne Leaflet und ohne Firestore, damit sie testbar bleibt.
 * Hintergrund: docs/karte-mehrfachauswahl.md.
 */
import type { LatLngPosition } from '../../../common/geo';
import type { FirecallItem } from '../../firebase/firestore';

export interface LatLngDelta {
  lat: number;
  lng: number;
}

export interface SelectionBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Laufende Verschiebung, solange gezogen oder gespeichert wird.
 *
 * `origins` hält je Element die Lage, von der die Verschiebung ausging. Die
 * Vorschau gilt nur, solange das Element noch dort steht — kommt der
 * Schreibvorgang im Abo an, steht es am Ziel und die Vorschau fällt von selbst
 * weg, ohne dass der Zeitpunkt des Zurücksetzens stimmen muss.
 */
export interface SelectionPreview {
  delta: LatLngDelta;
  /** Das Element, das Leaflet gerade selbst zieht (oder `handle`). */
  sourceId: string;
  origins: Record<string, string>;
}

/**
 * Typen, die bei der Mehrfachauswahl nicht mitgehen:
 * - `drawing`: die Striche liegen in einer Untersammlung, nicht am Element.
 * - `wasserstand`: die Bänder werden beim Verschieben aus dem Gelände neu
 *   berechnet, eine reine Verschiebung ließe sie an der alten Stelle.
 * - die übrigen haben keine Lage auf der Karte.
 */
const EXCLUDED_TYPES = new Set([
  'drawing',
  'wasserstand',
  'diary',
  'gb',
  'spectrum',
  'layer',
]);

const MULTI_POINT_TYPES = new Set(['line', 'connection', 'area']);

type LooseItem = FirecallItem & {
  positions?: string;
  destLat?: number;
  destLng?: number;
};

const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function isMultiPoint(item: LooseItem): boolean {
  return MULTI_POINT_TYPES.has(item.type) || typeof item.positions === 'string';
}

function parsePositions(item: LooseItem): LatLngPosition[] | undefined {
  if (typeof item.positions !== 'string') return undefined;
  try {
    const parsed = JSON.parse(item.positions);
    return Array.isArray(parsed) ? (parsed as LatLngPosition[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Alle Punkte eines Elements — ein Marker hat einen, eine Linie mehrere. */
export function itemPositions(item: FirecallItem): LatLngPosition[] {
  const loose = item as LooseItem;
  if (isMultiPoint(loose)) {
    const parsed = parsePositions(loose);
    if (parsed) return parsed;
    const fallback: LatLngPosition[] = [];
    if (isNumber(loose.lat) && isNumber(loose.lng))
      fallback.push([loose.lat, loose.lng]);
    if (isNumber(loose.destLat) && isNumber(loose.destLng))
      fallback.push([loose.destLat, loose.destLng]);
    return fallback;
  }
  return isNumber(item.lat) && isNumber(item.lng) ? [[item.lat, item.lng]] : [];
}

export function boundsFromCorners(
  a: LatLngDelta,
  b: LatLngDelta
): SelectionBounds {
  return {
    south: Math.min(a.lat, b.lat),
    west: Math.min(a.lng, b.lng),
    north: Math.max(a.lat, b.lat),
    east: Math.max(a.lng, b.lng),
  };
}

const inBounds = ([lat, lng]: LatLngPosition, b: SelectionBounds) =>
  lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;

/**
 * Ein Element liegt im Rahmen, sobald **ein** Punkt darin liegt. Eine lange
 * Leitung ganz einzurahmen hieße oft, weit hinauszuzoomen; wer sie nicht mit
 * will, nimmt sie per Umschalt-Klick wieder heraus.
 */
export function isItemInBounds(
  item: FirecallItem,
  bounds: SelectionBounds
): boolean {
  return itemPositions(item).some((p) => inBounds(p, bounds));
}

export function isMultiSelectable(item: FirecallItem): boolean {
  return (
    !!item.id &&
    item.deleted !== true &&
    item.editable !== false &&
    item.draggable !== false &&
    !EXCLUDED_TYPES.has(item.type)
  );
}

export function selectItemsInBounds(
  items: FirecallItem[],
  bounds: SelectionBounds
): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (isMultiSelectable(item) && isItemInBounds(item, bounds)) {
      ids.add(item.id as string);
    }
  }
  return [...ids];
}

export function toggleSelected(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function translatePositions(
  positions: LatLngPosition[],
  delta: LatLngDelta
): LatLngPosition[] {
  return positions.map(([lat, lng]) => [lat + delta.lat, lng + delta.lng]);
}

export interface ItemTranslation {
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}

/**
 * Die Felder, die eine Verschiebung um `delta` an einem Element ändert.
 *
 * Bei Linien und Flächen gehen `positions` **und** `lat`/`lng`/`destLat`/
 * `destLng` mit: `getConnectionPositions` fällt ohne `positions` auf diese
 * Felder zurück, und `lat`/`lng` dienen Popups und Listen als Lage des
 * Elements. Länge und Fläche bleiben bei einer reinen Verschiebung gleich und
 * werden nicht geschrieben.
 */
export function translateItem(
  item: FirecallItem,
  delta: LatLngDelta
): ItemTranslation | undefined {
  if (delta.lat === 0 && delta.lng === 0) return undefined;
  const loose = item as LooseItem;
  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  if (isMultiPoint(loose)) {
    const parsed = parsePositions(loose);
    if (parsed) {
      previousValue.positions = loose.positions;
      newValue.positions = JSON.stringify(translatePositions(parsed, delta));
    }
    if (isNumber(loose.destLat) && isNumber(loose.destLng)) {
      previousValue.destLat = loose.destLat;
      previousValue.destLng = loose.destLng;
      newValue.destLat = loose.destLat + delta.lat;
      newValue.destLng = loose.destLng + delta.lng;
    }
  }
  if (isNumber(loose.lat) && isNumber(loose.lng)) {
    previousValue.lat = loose.lat;
    previousValue.lng = loose.lng;
    newValue.lat = loose.lat + delta.lat;
    newValue.lng = loose.lng + delta.lng;
  }

  if (Object.keys(newValue).length === 0) return undefined;
  return { previousValue, newValue };
}

/** Kennzeichen der aktuellen Lage, um zu erkennen, ob ein Element schon am Ziel steht. */
export function positionSignature(item: FirecallItem): string {
  return JSON.stringify(itemPositions(item));
}

/** Die Verschiebung, um die ein Element gerade vorschauweise versetzt zu zeichnen ist. */
export function previewDeltaFor(
  item: FirecallItem,
  preview: SelectionPreview | undefined
): LatLngDelta | undefined {
  if (!preview || !item.id || item.id === preview.sourceId) return undefined;
  const origin = preview.origins[item.id];
  if (origin === undefined || origin !== positionSignature(item)) {
    return undefined;
  }
  return preview.delta;
}

/** Mitte des Rechtecks um alle Punkte der Elemente. */
export function selectionCenter(
  items: FirecallItem[]
): LatLngDelta | undefined {
  const all = items.flatMap(itemPositions);
  if (all.length === 0) return undefined;
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

/**
 * Mitte der Auswahl, wie sie gerade gezeichnet wird — mit der Vorschau einer
 * laufenden Verschiebung. Daran hängt der Griff zum Verschieben.
 */
export function previewedCenter(
  items: FirecallItem[],
  preview: SelectionPreview | undefined
): LatLngDelta | undefined {
  const all = items.flatMap((item) => {
    const delta = previewDeltaFor(item, preview);
    const positions = itemPositions(item);
    return delta ? translatePositions(positions, delta) : positions;
  });
  if (all.length === 0) return undefined;
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}
