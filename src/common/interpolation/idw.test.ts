import { describe, it, expect } from 'vitest';
import { idwAlgorithm } from './idw';
import type { DataPoint } from './types';

describe('IDW algorithm', () => {
  const points: DataPoint[] = [
    { x: 0, y: 0, value: 10 },
    { x: 10, y: 0, value: 20 },
  ];

  it('has correct metadata', () => {
    expect(idwAlgorithm.id).toBe('idw');
    expect(idwAlgorithm.params).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'power' })])
    );
  });

  it('prepare + evaluate returns exact value at data point', () => {
    const state = idwAlgorithm.prepare(points, { power: 2 });
    expect(idwAlgorithm.evaluate(0, 0, state)).toBeCloseTo(10);
    expect(idwAlgorithm.evaluate(10, 0, state)).toBeCloseTo(20);
  });

  it('returns midpoint value at equal distance', () => {
    const state = idwAlgorithm.prepare(points, { power: 2 });
    expect(idwAlgorithm.evaluate(5, 0, state)).toBeCloseTo(15);
  });

  it('respects power parameter', () => {
    const state2 = idwAlgorithm.prepare(points, { power: 2 });
    const state4 = idwAlgorithm.prepare(points, { power: 4 });
    // Higher power → value closer to nearest point
    const val2 = idwAlgorithm.evaluate(2, 0, state2);
    const val4 = idwAlgorithm.evaluate(2, 0, state4);
    expect(val4).toBeLessThan(val2); // closer to 10 with higher power
  });

  it('uses default power from param descriptor', () => {
    const powerParam = idwAlgorithm.params.find((p) => p.key === 'power')!;
    const state = idwAlgorithm.prepare(points, {});
    // Should use default power (2)
    const expected = idwAlgorithm.prepare(points, { power: powerParam.default as number });
    expect(idwAlgorithm.evaluate(5, 0, state)).toBeCloseTo(
      idwAlgorithm.evaluate(5, 0, expected)
    );
  });
});
