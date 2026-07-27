import { LatLngPosition } from '../../../../common/geo';

/**
 * Squared distance from point `p` to the segment `a`–`b`, using a local planar
 * approximation (longitude scaled by cos(latitude) so the metric is roughly
 * isotropic at the given latitude). Only used for *comparing* segments, so the
 * absolute value/units don't matter.
 */
function pointToSegmentDistanceSq(
  p: LatLngPosition,
  a: LatLngPosition,
  b: LatLngPosition
): number {
  const latScale = Math.cos((p[0] * Math.PI) / 180) || 1;
  const px = p[1] * latScale;
  const py = p[0];
  const ax = a[1] * latScale;
  const ay = a[0];
  const bx = b[1] * latScale;
  const by = b[0];

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Index at which a new vertex clicked at `point` should be inserted so it lands
 * on the segment nearest to the click. Works for clicks on an edge as well as
 * clicks inside/near the shape. For a closed shape (area) the closing edge
 * (last → first vertex) is considered too. Returns an index usable directly as
 * the splice position (`positions.splice(index, 0, point)`).
 */
export function nearestInsertIndex(
  positions: LatLngPosition[],
  point: LatLngPosition,
  closed: boolean
): number {
  const n = positions.length;
  if (n < 2) return n;
  const segmentCount = closed ? n : n - 1;
  let bestDistance = Infinity;
  let bestIndex = n;
  for (let i = 0; i < segmentCount; i++) {
    const a = positions[i];
    const b = positions[(i + 1) % n];
    const d = pointToSegmentDistanceSq(point, a, b);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i + 1;
    }
  }
  return bestIndex;
}

/**
 * Compute the position for a new point that is inserted directly after the
 * point at `index`. Used by the right-click "Punkt einfügen" action on
 * area/line vertices. Kept in a firebase-free module so it can be unit tested
 * in isolation.
 *
 * - Middle vertex: midpoint between the vertex and its successor.
 * - Last vertex of a closed shape (area): midpoint on the closing edge back
 *   to the first vertex.
 * - Last vertex of an open shape (line): extends the last segment beyond the
 *   end by half its length.
 * - Single point: the point itself.
 */
export function insertedPointPosition(
  positions: LatLngPosition[],
  index: number,
  closed: boolean
): LatLngPosition {
  const n = positions.length;
  const cur = positions[index];
  if (index + 1 < n) {
    const next = positions[index + 1];
    return [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2];
  }
  if (closed && n >= 2) {
    const first = positions[0];
    return [(cur[0] + first[0]) / 2, (cur[1] + first[1]) / 2];
  }
  if (n >= 2) {
    const prev = positions[index - 1];
    return [cur[0] + (cur[0] - prev[0]) / 2, cur[1] + (cur[1] - prev[1]) / 2];
  }
  return cur;
}
