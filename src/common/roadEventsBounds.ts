/**
 * Kartenausschnitt der Verkehrsmeldungen: Die Ebene lädt einen um den
 * Ausschnitt erweiterten Bereich und lädt erst nach, wenn die Ansicht ihn
 * verlässt. Siehe docs/verkehrsmeldungen.md.
 */
import { BoundingBox, RoadEventWithPath } from './roadEvents';

/** Erweitert jede Seite um `factor` × Breite bzw. Höhe. */
export function padBounds(bounds: BoundingBox, factor: number): BoundingBox {
  const height = bounds.north - bounds.south;
  const width = bounds.east - bounds.west;
  return {
    south: Math.max(-90, bounds.south - height * factor),
    north: Math.min(90, bounds.north + height * factor),
    west: Math.max(-180, bounds.west - width * factor),
    east: Math.min(180, bounds.east + width * factor),
  };
}

/** true, wenn `inner` ganz in `outer` liegt. */
export function boundsContain(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

function pathBounds(path: RoadEventWithPath['path']): BoundingBox {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [lat, lng] of path) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return { south, north, west, east };
}

/** Meldungen, deren Verlauf (als Rechteck) den Bereich berührt. */
export function filterEventsByBounds(
  events: RoadEventWithPath[],
  bounds: BoundingBox
): RoadEventWithPath[] {
  return events.filter((event) => {
    const b = pathBounds(event.path);
    return (
      b.south <= bounds.north &&
      b.north >= bounds.south &&
      b.west <= bounds.east &&
      b.east >= bounds.west
    );
  });
}
