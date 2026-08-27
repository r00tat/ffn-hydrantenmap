import type { FirecallItem } from '../../components/firebase/firestore';
import { LatLngPosition } from '../geo';

/** GeoJSON-Koordinate: `[lng, lat]` */
export type GeoJsonCoordinate = [number, number];

/**
 * Geometrie eines Items als `[lat, lng]`-Liste.
 *
 * `positions` ist im Firestore ein JSON-String, nicht ein Array. Ältere
 * Dokumente haben stattdessen nur `lat`/`lng` plus `destLat`/`destLng`.
 * Kaputtes JSON liefert ein leeres Array — der Export soll an einem einzelnen
 * Element nicht scheitern.
 */
export function itemPositions(item: FirecallItem): LatLngPosition[] {
  const raw = (item as { positions?: string }).positions;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (p): p is LatLngPosition =>
            Array.isArray(p) &&
            p.length >= 2 &&
            typeof p[0] === 'number' &&
            typeof p[1] === 'number',
        );
      }
    } catch {
      return [];
    }
    return [];
  }

  const { lat, lng } = item;
  const dest = item as { destLat?: number; destLng?: number };
  if (typeof lat === 'number' && typeof lng === 'number') {
    if (typeof dest.destLat === 'number' && typeof dest.destLng === 'number') {
      return [
        [lat, lng],
        [dest.destLat, dest.destLng],
      ];
    }
    return [[lat, lng]];
  }
  return [];
}

/** `[lat, lng]` → `[lng, lat]` */
export function positionsToGeoJson(
  positions: LatLngPosition[],
): GeoJsonCoordinate[] {
  return positions.map(([lat, lng]) => [lng, lat]);
}

/** `[lng, lat]` → `[lat, lng]`; unbrauchbare Koordinaten fallen weg */
export function geoJsonToPositions(coordinates: number[][]): LatLngPosition[] {
  return (Array.isArray(coordinates) ? coordinates : [])
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => [c[1], c[0]] as LatLngPosition);
}

function samePoint(a: number[], b: number[]) {
  return a[0] === b[0] && a[1] === b[1];
}

/** Schließt einen GeoJSON-Ring, falls nötig. */
export function closeRing(ring: GeoJsonCoordinate[]): GeoJsonCoordinate[] {
  if (ring.length < 3) return ring;
  if (samePoint(ring[0], ring[ring.length - 1])) return ring;
  return [...ring, ring[0]];
}

/** Entfernt den doppelten Schlusspunkt eines Rings — unser Modell speichert offen. */
export function openRing(ring: LatLngPosition[]): LatLngPosition[] {
  if (ring.length < 2) return ring;
  if (!samePoint(ring[0], ring[ring.length - 1])) return ring;
  return ring.slice(0, -1);
}
