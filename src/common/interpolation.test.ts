import { describe, it, expect, vi } from 'vitest';

// Mock Firebase-dependent modules so interpolation.ts loads cleanly
vi.mock('../components/firebase/firestore', () => ({
  HeatmapConfig: {},
}));
vi.mock('./heatmap', () => ({
  normalizeValueFull: vi.fn(),
}));

import {
  computeConvexHull,
  pointInPolygon,
  distanceToSegment,
  idwInterpolate,
} from './interpolation';

describe('computeConvexHull', () => {
  it('returns single point unchanged', () => {
    const pts = [{ x: 1, y: 1 }];
    expect(computeConvexHull(pts)).toEqual(pts);
  });

  it('returns two points unchanged', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(computeConvexHull(pts)).toEqual(pts);
  });

  it('computes hull of a square (all 4 corners on hull)', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const hull = computeConvexHull(square);
    expect(hull).toHaveLength(4);
    for (const pt of square) {
      expect(hull).toContainEqual(pt);
    }
  });

  it('excludes interior point from hull', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 }, // interior point
    ];
    const hull = computeConvexHull(points);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 1, y: 1 });
  });

  it('handles collinear points by returning input as-is', () => {
    const collinear = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const hull = computeConvexHull(collinear);
    expect(hull).toEqual(collinear);
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('returns true for a point clearly inside the polygon', () => {
    expect(pointInPolygon(2, 2, square)).toBe(true);
  });

  it('returns false for a point clearly outside the polygon', () => {
    expect(pointInPolygon(10, 10, square)).toBe(false);
  });

  it('does not throw for a point at origin corner', () => {
    expect(() => pointInPolygon(0, 0, square)).not.toThrow();
  });
});

describe('distanceToSegment', () => {
  it('returns 0 for a point on the segment', () => {
    expect(distanceToSegment(1, 0, 0, 0, 2, 0)).toBeCloseTo(0);
  });

  it('returns perpendicular distance for a point off the segment', () => {
    expect(distanceToSegment(1, 1, 0, 0, 2, 0)).toBeCloseTo(1);
  });

  it('returns distance to nearest endpoint when projection falls outside', () => {
    expect(distanceToSegment(5, 0, 0, 0, 2, 0)).toBeCloseTo(3);
  });

  it('handles degenerate segment (both endpoints equal)', () => {
    // distance from (4,5) to point (1,1) = sqrt(9+16) = 5
    expect(distanceToSegment(4, 5, 1, 1, 1, 1)).toBeCloseTo(5);
  });
});

describe('idwInterpolate', () => {
  const points = [
    { x: 0, y: 0, value: 10 },
    { x: 10, y: 0, value: 20 },
  ];

  it('returns exact value at a data point', () => {
    expect(idwInterpolate(0, 0, points, 2)).toBeCloseTo(10);
    expect(idwInterpolate(10, 0, points, 2)).toBeCloseTo(20);
  });

  it('returns midpoint value at equal distance from two points', () => {
    expect(idwInterpolate(5, 0, points, 2)).toBeCloseTo(15);
  });

  it('returns value closer to nearer point', () => {
    const result = idwInterpolate(2, 0, points, 2);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(15);
  });

  it('returns 0 for empty points array', () => {
    expect(idwInterpolate(0, 0, [], 2)).toBe(0);
  });
});
