import type { GeoPositionObject } from '../../common/geo';

/**
 * Am Einsatz-Dokument gespeicherte Route. Die Koordinaten stehen mit dabei,
 * weil ein verschobener Einsatzort den Wert ungültig macht — ohne sie fiele
 * das niemandem auf.
 */
export interface FirecallRouteCache {
  /** Einfache Strecke in Metern. */
  distanceM: number;
  from: [number, number];
  to: [number, number];
}

export function routeCacheEntry(
  from: GeoPositionObject,
  to: GeoPositionObject,
  distanceM: number,
): FirecallRouteCache {
  return {
    distanceM,
    from: [from.lat, from.lng],
    to: [to.lat, to.lng],
  };
}

/**
 * Vergleicht auf exakte Gleichheit statt mit Toleranz: Die Koordinaten im
 * Cache stammen aus demselben Schreibvorgang wie der Vergleichswert — bei
 * Abweichung wird einfach neu gerechnet, das kostet nur einen API-Aufruf.
 */
function samePosition(
  cached: [number, number] | undefined,
  position: GeoPositionObject,
): boolean {
  return (
    Array.isArray(cached) &&
    cached.length === 2 &&
    cached[0] === position.lat &&
    cached[1] === position.lng
  );
}

/**
 * Die gecachte Distanz, sofern sie für genau diese Koordinaten gilt. Bei
 * Abweichung oder einem unvollständigen Cache `undefined` — dann wird neu
 * gerechnet.
 */
export function cachedRouteDistance(
  cache: FirecallRouteCache | undefined,
  from: GeoPositionObject,
  to: GeoPositionObject,
): number | undefined {
  if (typeof cache?.distanceM !== 'number') return undefined;
  if (!samePosition(cache.from, from)) return undefined;
  if (!samePosition(cache.to, to)) return undefined;
  return cache.distanceM;
}
