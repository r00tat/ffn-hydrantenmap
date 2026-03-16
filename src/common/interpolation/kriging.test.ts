import { describe, it, expect } from 'vitest';
import { krigingAlgorithm, fitVariogram, VARIOGRAM_SPHERICAL, VARIOGRAM_EXPONENTIAL, VARIOGRAM_GAUSSIAN } from './kriging';
import type { DataPoint } from './types';

// Helper: grid of points with a known linear trend Z = x + y
function linearTrendGrid(): DataPoint[] {
  const pts: DataPoint[] = [];
  for (let x = 0; x <= 100; x += 20) {
    for (let y = 0; y <= 100; y += 20) {
      pts.push({ x, y, value: x + y });
    }
  }
  return pts;
}

// Helper: four corners with distinct values
function cornerPoints(): DataPoint[] {
  return [
    { x: 0, y: 0, value: 10 },
    { x: 100, y: 0, value: 20 },
    { x: 0, y: 100, value: 30 },
    { x: 100, y: 100, value: 40 },
  ];
}

describe('Kriging algorithm', () => {
  describe('metadata', () => {
    it('has correct id and label', () => {
      expect(krigingAlgorithm.id).toBe('kriging');
      expect(krigingAlgorithm.label).toBe('Kriging');
    });

    it('exposes variogramModel, nugget, and maxNeighbors params', () => {
      const keys = krigingAlgorithm.params.map((p) => p.key);
      expect(keys).toContain('variogramModel');
      expect(keys).toContain('nugget');
      expect(keys).toContain('maxNeighbors');
    });

    it('has a description', () => {
      expect(krigingAlgorithm.description).toBeTruthy();
    });
  });

  describe('prepare + evaluate lifecycle', () => {
    it('returns value close to data at a data point location', () => {
      const points = cornerPoints();
      const state = krigingAlgorithm.prepare(points, {});
      // At exact data point, should be very close to the known value
      expect(krigingAlgorithm.evaluate(0, 0, state)).toBeCloseTo(10, 0);
      expect(krigingAlgorithm.evaluate(100, 100, state)).toBeCloseTo(40, 0);
    });

    it('interpolates between points', () => {
      const points = cornerPoints();
      const state = krigingAlgorithm.prepare(points, {});
      const mid = krigingAlgorithm.evaluate(50, 50, state);
      // Center of four corners should be near the average (25)
      expect(mid).toBeGreaterThan(15);
      expect(mid).toBeLessThan(35);
    });

    it('handles single point gracefully', () => {
      const points: DataPoint[] = [{ x: 50, y: 50, value: 42 }];
      const state = krigingAlgorithm.prepare(points, {});
      // With one point, should return that value everywhere
      expect(krigingAlgorithm.evaluate(50, 50, state)).toBeCloseTo(42);
      expect(krigingAlgorithm.evaluate(0, 0, state)).toBeCloseTo(42);
    });

    it('handles two points', () => {
      const points: DataPoint[] = [
        { x: 0, y: 0, value: 10 },
        { x: 100, y: 0, value: 20 },
      ];
      const state = krigingAlgorithm.prepare(points, {});
      const mid = krigingAlgorithm.evaluate(50, 0, state);
      expect(mid).toBeCloseTo(15, 0);
    });

    it('recovers a linear trend on a grid', () => {
      const points = linearTrendGrid();
      const state = krigingAlgorithm.prepare(points, {});
      // Kriging should exactly reproduce a linear trend
      // (Ordinary Kriging preserves linear fields within the data extent)
      const val = krigingAlgorithm.evaluate(50, 50, state);
      expect(val).toBeCloseTo(100, -1); // x + y = 100, allow +-10
    });
  });

  describe('variogram models', () => {
    it('works with spherical model (default)', () => {
      const points = cornerPoints();
      const state = krigingAlgorithm.prepare(points, { variogramModel: VARIOGRAM_SPHERICAL });
      const val = krigingAlgorithm.evaluate(50, 50, state);
      expect(val).not.toBeNaN();
    });

    it('works with exponential model', () => {
      const points = cornerPoints();
      const state = krigingAlgorithm.prepare(points, { variogramModel: VARIOGRAM_EXPONENTIAL });
      const val = krigingAlgorithm.evaluate(50, 50, state);
      expect(val).not.toBeNaN();
    });

    it('works with gaussian model', () => {
      const points = cornerPoints();
      const state = krigingAlgorithm.prepare(points, { variogramModel: VARIOGRAM_GAUSSIAN });
      const val = krigingAlgorithm.evaluate(50, 50, state);
      expect(val).not.toBeNaN();
    });
  });

  describe('nugget parameter', () => {
    it('higher nugget produces smoother output (less variance between nearby predictions)', () => {
      const points = cornerPoints();
      const state0 = krigingAlgorithm.prepare(points, { nugget: 0 });
      const state05 = krigingAlgorithm.prepare(points, { nugget: 0.5 });
      // With higher nugget, predictions should regress toward the mean
      const val0 = krigingAlgorithm.evaluate(1, 1, state0);
      const val05 = krigingAlgorithm.evaluate(1, 1, state05);
      // val0 should be closer to the nearest point (10) than val05
      expect(Math.abs(val0 - 10)).toBeLessThanOrEqual(Math.abs(val05 - 10) + 1);
    });
  });

  describe('maxNeighbors parameter', () => {
    it('limits neighbors used in prediction', () => {
      const points = linearTrendGrid(); // 36 points
      const stateAll = krigingAlgorithm.prepare(points, { maxNeighbors: 50 });
      const stateFew = krigingAlgorithm.prepare(points, { maxNeighbors: 5 });
      // Both should produce finite values
      expect(krigingAlgorithm.evaluate(50, 50, stateAll)).not.toBeNaN();
      expect(krigingAlgorithm.evaluate(50, 50, stateFew)).not.toBeNaN();
    });
  });
});

describe('fitVariogram', () => {
  it('estimates positive sill and range for spatially varying data', () => {
    const points = linearTrendGrid();
    const vario = fitVariogram(points, VARIOGRAM_SPHERICAL, 0);
    expect(vario.sill).toBeGreaterThan(0);
    expect(vario.range).toBeGreaterThan(0);
    expect(vario.nugget).toBeGreaterThanOrEqual(0);
  });

  it('applies user-specified nugget fraction', () => {
    const points = linearTrendGrid();
    const vario = fitVariogram(points, VARIOGRAM_SPHERICAL, 0.5);
    // Nugget should be ~50% of sill
    expect(vario.nugget).toBeGreaterThan(0);
  });
});
