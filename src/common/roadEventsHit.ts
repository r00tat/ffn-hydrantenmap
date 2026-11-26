import { LatLng } from './roadEvents';

export interface ScreenPoint {
  x: number;
  y: number;
}

function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)
        );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Alle Meldungen, deren Verlauf höchstens `tolerancePx` vom Klickpunkt
 * entfernt ist — gemessen auf dem Bildschirm, damit die Trefferfläche bei
 * jeder Zoomstufe gleich groß ist.
 *
 * Sperre und Baustelle desselben Abschnitts liegen oft genau übereinander;
 * die obere Linie verdeckt dann die untere vollständig. Deshalb zeigt ein
 * Klick alle Meldungen an der Stelle statt nur die oberste. Die Reihenfolge
 * der Eingabe bleibt erhalten (schwerste zuerst), und eine Situation mit
 * mehreren Abschnitten erscheint nur einmal.
 */
export function eventsAtPoint<T extends { id: string; path: LatLng[] }>(
  events: T[],
  click: ScreenPoint,
  project: (latLng: LatLng) => ScreenPoint,
  tolerancePx: number
): T[] {
  const seen = new Set<string>();
  const hits: T[] = [];
  for (const event of events) {
    if (seen.has(event.id) || event.path.length === 0) continue;
    const points = event.path.map(project);
    let distance =
      points.length === 1
        ? Math.hypot(click.x - points[0].x, click.y - points[0].y)
        : Infinity;
    for (let i = 1; i < points.length && distance > tolerancePx; i++) {
      distance = Math.min(
        distance,
        distanceToSegment(click, points[i - 1], points[i])
      );
    }
    if (distance <= tolerancePx) {
      seen.add(event.id);
      hits.push(event);
    }
  }
  return hits;
}
