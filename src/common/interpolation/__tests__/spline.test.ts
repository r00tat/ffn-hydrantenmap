import { describe, it, expect } from 'vitest';
import { splineAlgorithm } from '../spline';
import type { DataPoint } from '../types';

describe('Spline (TPS) algorithm', () => {
  const points: DataPoint[] = [
    { x: 0, y: 0, value: 10 },
    { x: 100, y: 0, value: 20 },
    { x: 50, y: 100, value: 30 },
  ];

  it('has correct metadata', () => {
    expect(splineAlgorithm.id).toBe('spline');
    expect(splineAlgorithm.label).toBe('Thin-Plate Spline');
  });

  it('prepare + evaluate returns near-exact values at data points', () => {
    const state = splineAlgorithm.prepare(points, {});
    // With regularization, values may not be exact but should be close
    expect(splineAlgorithm.evaluate(0, 0, state)).toBeCloseTo(10, 0);
    expect(splineAlgorithm.evaluate(100, 0, state)).toBeCloseTo(20, 0);
    expect(splineAlgorithm.evaluate(50, 100, state)).toBeCloseTo(30, 0);
  });

  it('interpolates smoothly between points', () => {
    const state = splineAlgorithm.prepare(points, {});
    const midValue = splineAlgorithm.evaluate(50, 33, state);
    // Should be somewhere in the data range
    expect(midValue).toBeGreaterThanOrEqual(5);
    expect(midValue).toBeLessThanOrEqual(35);
  });
});
