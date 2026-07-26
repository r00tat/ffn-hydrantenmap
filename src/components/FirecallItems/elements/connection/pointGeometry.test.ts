import { describe, expect, it } from 'vitest';
import { LatLngPosition } from '../../../../common/geo';
import { insertedPointPosition } from './pointGeometry';

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
