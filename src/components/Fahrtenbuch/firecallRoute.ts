import type { GeoPositionObject } from '../../common/geo';
import type { RouteLegsMeters } from '../actions/maps/routes';

/**
 * Am Einsatz-Dokument gespeicherte Route. Die Koordinaten stehen mit dabei,
 * weil ein verschobener Einsatzort den Wert ungültig macht — ohne sie fiele
 * das niemandem auf.
 *
 * Hin- und Rückweg stehen getrennt, weil sie getrennt gemessen werden (siehe
 * `computeRouteLegsMeters`). Alte Dokumente tragen stattdessen ein
 * `distanceM` — die einfache Strecke aus der Zeit der Verdopplung. Das Feld
 * wird hier absichtlich nicht mehr gelesen: Es gilt als Fehltreffer, damit die
 * Route neu und diesmal richtungsgetrennt gemessen wird. Beim Überschreiben
 * kann es im Dokument stehen bleiben; es hat keine Wirkung mehr.
 */
export interface FirecallRouteCache {
  /** Hinweg (Feuerwehrhaus → Einsatzort) in Metern. */
  outboundM: number;
  /** Rückweg (Einsatzort → Feuerwehrhaus) in Metern. */
  returnM: number;
  from: [number, number];
  to: [number, number];
}

export function routeCacheEntry(
  from: GeoPositionObject,
  to: GeoPositionObject,
  legs: RouteLegsMeters,
): FirecallRouteCache {
  return {
    outboundM: legs.outboundMeters,
    returnM: legs.returnMeters,
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
 * Die gecachten Wegstrecken, sofern sie für genau diese Koordinaten gelten. Bei
 * Abweichung oder einem unvollständigen Cache `undefined` — dann wird neu
 * gerechnet.
 */
export function cachedRouteLegs(
  cache: FirecallRouteCache | undefined,
  from: GeoPositionObject,
  to: GeoPositionObject,
): RouteLegsMeters | undefined {
  if (typeof cache?.outboundM !== 'number') return undefined;
  if (typeof cache?.returnM !== 'number') return undefined;
  if (!samePosition(cache.from, from)) return undefined;
  if (!samePosition(cache.to, to)) return undefined;
  return { outboundMeters: cache.outboundM, returnMeters: cache.returnM };
}
