import { describe, it, expect } from 'vitest';
import { invSquareAlgorithm, valueAt1m } from '../invSquare';
import type { DataPoint } from '../types';

// All tests use 1 pixel = 1 metre so pixel coords == metric coords.
const MPP = 1.0;

// Helper: ring of n points at radius r around (0,0), each with value k/r².
// The optional shieldOverride map lets individual angles carry a different
// fraction of the expected value (simulating directional shielding).
function ringPoints(
  radius: number,
  k: number,
  angles: number[],
  shieldOverride: Record<number, number> = {}
): DataPoint[] {
  return angles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x = radius * Math.cos(rad);
    const y = radius * Math.sin(rad);
    const factor = shieldOverride[deg] ?? 1.0;
    return { x, y, value: (k / (radius * radius)) * factor };
  });
}

describe('invSquareAlgorithm metadata', () => {
  it('has id "inv-square"', () => {
    expect(invSquareAlgorithm.id).toBe('inv-square');
  });

  it('has a non-empty label', () => {
    expect(invSquareAlgorithm.label.length).toBeGreaterThan(0);
  });
});

describe('invSquareAlgorithm — perfect inverse-square (no shielding)', () => {
  // k = 1000: I(d) = 1000 / d²  →  I(10) = 10,  I(20) = 2.5
  const k = 1000;
  const angles = [0, 90, 180, 270];
  const pts10 = ringPoints(10, k, angles);
  const pts20 = ringPoints(20, k, angles);
  const points: DataPoint[] = [...pts10, ...pts20];

  it('recovers source strength k ≈ 1000 (value at 1 m)', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    expect(valueAt1m(state)).toBeCloseTo(k, -1); // within ±50
  });

  it('locates source near origin', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    expect(state.sourceX).toBeCloseTo(0, 0);
    expect(state.sourceY).toBeCloseTo(0, 0);
  });

  it('evaluates close to measured value at each measurement point', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    for (const p of points) {
      const got = invSquareAlgorithm.evaluate(p.x, p.y, state);
      expect(got).toBeCloseTo(p.value, 0); // within ±1 unit
    }
  });

  it('follows inverse-square law between measurement distances', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    const at15 = invSquareAlgorithm.evaluate(15, 0, state);
    // k / 15² = 1000 / 225 ≈ 4.44
    expect(at15).toBeCloseTo(k / (15 * 15), 0);
  });
});

describe('invSquareAlgorithm — directional shielding', () => {
  // 8 equally spaced measurements; east (0°) is 50% shielded.
  const k = 1000;
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const points = ringPoints(10, k, angles, { 0: 0.5 });

  it('shielded direction (east) shows lower value than unshielded (west)', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    const east = invSquareAlgorithm.evaluate(10, 0, state);
    const west = invSquareAlgorithm.evaluate(-10, 0, state);
    expect(east).toBeLessThan(west * 0.75);
  });

  it('unshielded direction (west) stays near the physics value', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    const west = invSquareAlgorithm.evaluate(-10, 0, state);
    expect(west).toBeCloseTo(k / (10 * 10), 0); // ≈ 10
  });

  it('grid value behind shielding is proportionally reduced at larger distance', () => {
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });
    const eastNear = invSquareAlgorithm.evaluate(10, 0, state);
    const eastFar = invSquareAlgorithm.evaluate(20, 0, state);
    // Shielding is directional — both east points should be reduced,
    // and the far point should be less than the near point.
    expect(eastFar).toBeLessThan(eastNear);
  });
});

describe('invSquareAlgorithm — edge cases', () => {
  it('returns 0 for empty point set', () => {
    const state = invSquareAlgorithm.prepare([], { _metersPerPixel: MPP });
    expect(invSquareAlgorithm.evaluate(5, 5, state)).toBe(0);
    expect(valueAt1m(state)).toBe(0);
  });

  it('does not throw for a single measurement point', () => {
    const pts: DataPoint[] = [{ x: 10, y: 0, value: 5 }];
    const state = invSquareAlgorithm.prepare(pts, { _metersPerPixel: MPP });
    expect(() => invSquareAlgorithm.evaluate(5, 0, state)).not.toThrow();
  });

  it('does not return negative values anywhere', () => {
    const k = 500;
    const angles = [0, 60, 120, 180, 240, 300];
    const points = ringPoints(10, k, angles, { 60: 0.1, 120: 0.1 });
    const state = invSquareAlgorithm.prepare(points, { _metersPerPixel: MPP });

    for (let x = -30; x <= 30; x += 10) {
      for (let y = -30; y <= 30; y += 10) {
        expect(invSquareAlgorithm.evaluate(x, y, state)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});