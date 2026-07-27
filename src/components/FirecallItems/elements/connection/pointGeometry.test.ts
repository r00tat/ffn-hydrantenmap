import { describe, expect, it } from 'vitest';
import { LatLngPosition } from '../../../../common/geo';
import { insertedPointPosition, nearestInsertIndex } from './pointGeometry';

describe('insertedPointPosition', () => {
  const positions: LatLngPosition[] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];

  it('returns the midpoint to the next point for a middle vertex', () => {
    expect(insertedPointPosition(positions, 0, false)).toEqual([5, 0]);
    expect(insertedPointPosition(positions, 1, false)).toEqual([10, 5]);
  });

  it('closes the ring to the first point for the last vertex of an area', () => {
    // last point [10,10] -> midpoint to first [0,0] = [5,5]
    expect(insertedPointPosition(positions, 2, true)).toEqual([5, 5]);
  });

  it('extends beyond the last vertex for an open line', () => {
    // last segment [10,0] -> [10,10], extend by half beyond [10,10] = [10,15]
    expect(insertedPointPosition(positions, 2, false)).toEqual([10, 15]);
  });

  it('returns the point itself when there is only a single point', () => {
    expect(insertedPointPosition([[3, 4]], 0, false)).toEqual([3, 4]);
    expect(insertedPointPosition([[3, 4]], 0, true)).toEqual([3, 4]);
  });
});

describe('nearestInsertIndex', () => {
  // Square at latitude 0 (cos(0)=1 → planar), vertices [lat, lng].
  const square: LatLngPosition[] = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ];

  it('inserts on the nearest edge of a closed area', () => {
    // near edge 0 ([0,0]-[0,10]) -> insert at 1
    expect(nearestInsertIndex(square, [0, 5], true)).toBe(1);
    // near edge 1 ([0,10]-[10,10]) -> insert at 2
    expect(nearestInsertIndex(square, [5, 10], true)).toBe(2);
    // near the closing edge ([10,0]-[0,0]) -> append at 4
    expect(nearestInsertIndex(square, [5, 0], true)).toBe(4);
  });

  it('picks the nearest edge for a click inside the area', () => {
    // slightly inside, closest to edge 0 (lng side 0)
    expect(nearestInsertIndex(square, [1, 5], true)).toBe(1);
  });

  it('ignores the closing edge for an open line', () => {
    const line: LatLngPosition[] = [
      [0, 0],
      [0, 10],
      [10, 10],
    ];
    expect(nearestInsertIndex(line, [0, 5], false)).toBe(1);
    expect(nearestInsertIndex(line, [5, 10], false)).toBe(2);
    // a click near the (non-existent) closing edge still maps to a real segment
    expect(nearestInsertIndex(line, [5, 0], false)).toBe(1);
  });

  it('appends when there are fewer than two points', () => {
    expect(nearestInsertIndex([[1, 1]], [2, 2], false)).toBe(1);
    expect(nearestInsertIndex([], [2, 2], true)).toBe(0);
  });
});
