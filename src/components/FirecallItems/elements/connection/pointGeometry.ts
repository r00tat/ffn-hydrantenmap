import { LatLngPosition } from '../../../../common/geo';

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
