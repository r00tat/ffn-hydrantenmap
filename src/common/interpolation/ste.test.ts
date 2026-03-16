import { describe, it, expect } from 'vitest';
import { pasquillSigmaY, pasquillSigmaZ, gaussianPlume, estimateSource } from './ste';
import type { DataPoint } from './types';

describe('Pasquill-Gifford dispersion coefficients', () => {
  it('returns positive sigma_y for all stability classes at 100m downwind', () => {
    for (let sc = 1; sc <= 6; sc++) {
      const sy = pasquillSigmaY(100, sc);
      expect(sy).toBeGreaterThan(0);
    }
  });

  it('returns positive sigma_z for all stability classes at 100m downwind', () => {
    for (let sc = 1; sc <= 6; sc++) {
      const sz = pasquillSigmaZ(100, sc);
      expect(sz).toBeGreaterThan(0);
    }
  });

  it('sigma_y increases with downwind distance', () => {
    const sy100 = pasquillSigmaY(100, 4);
    const sy500 = pasquillSigmaY(500, 4);
    expect(sy500).toBeGreaterThan(sy100);
  });

  it('sigma_z increases with downwind distance', () => {
    const sz100 = pasquillSigmaZ(100, 4);
    const sz500 = pasquillSigmaZ(500, 4);
    expect(sz500).toBeGreaterThan(sz100);
  });

  it('unstable (A=1) disperses more than stable (F=6) at same distance', () => {
    const syA = pasquillSigmaY(500, 1);
    const syF = pasquillSigmaY(500, 6);
    expect(syA).toBeGreaterThan(syF);
  });

  it('returns minimum sigma for zero or negative distance', () => {
    expect(pasquillSigmaY(0, 4)).toBeGreaterThan(0);
    expect(pasquillSigmaZ(-10, 4)).toBeGreaterThan(0);
  });
});

describe('Gaussian Plume concentration', () => {
  const baseParams = {
    Q: 100,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
  };

  it('returns positive concentration downwind on centerline', () => {
    const c = gaussianPlume(100, 0, baseParams);
    expect(c).toBeGreaterThan(0);
  });

  it('returns zero or near-zero upwind', () => {
    const c = gaussianPlume(-100, 0, baseParams);
    expect(c).toBeCloseTo(0, 5);
  });

  it('concentration decreases with downwind distance (on centerline)', () => {
    const c100 = gaussianPlume(100, 0, baseParams);
    const c500 = gaussianPlume(500, 0, baseParams);
    expect(c100).toBeGreaterThan(c500);
  });

  it('concentration decreases with crosswind distance', () => {
    const cCenter = gaussianPlume(200, 0, baseParams);
    const cOff = gaussianPlume(200, 50, baseParams);
    expect(cCenter).toBeGreaterThan(cOff);
  });

  it('concentration is symmetric about centerline', () => {
    const cLeft = gaussianPlume(200, -30, baseParams);
    const cRight = gaussianPlume(200, 30, baseParams);
    expect(cLeft).toBeCloseTo(cRight);
  });

  it('higher release rate gives proportionally higher concentration', () => {
    const c1 = gaussianPlume(200, 0, { ...baseParams, Q: 100 });
    const c2 = gaussianPlume(200, 0, { ...baseParams, Q: 200 });
    expect(c2).toBeCloseTo(c1 * 2);
  });

  it('returns 0 at downwind distance of 0', () => {
    const c = gaussianPlume(0, 0, baseParams);
    expect(c).toBe(0);
  });
});

describe('Source estimation (grid search)', () => {
  // Wind blowing from west (270deg) -> towards east
  const windDirRad = Math.PI / 2; // "towards" direction (east) in math coords
  const params = {
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 10,
  };

  it('estimates source near the true source for a simple scenario', () => {
    // True source at (0, 0), generate synthetic measurements downwind
    const trueQ = 100;
    const measurements: DataPoint[] = [];
    for (const dist of [50, 100, 200]) {
      const c = gaussianPlume(dist, 0, {
        Q: trueQ,
        windSpeed: params.windSpeed,
        stabilityClass: params.stabilityClass,
        releaseHeight: params.releaseHeight,
      });
      measurements.push({ x: dist, y: 0, value: c });
    }

    const result = estimateSource(measurements, windDirRad, params);

    expect(result.sourceX).toBeCloseTo(0, -1); // within ~10 units
    expect(result.sourceY).toBeCloseTo(0, -1);
    expect(result.releaseRate).toBeGreaterThan(0);
  });

  it('returns positive release rate', () => {
    const measurements: DataPoint[] = [
      { x: 50, y: 0, value: 5 },
      { x: 100, y: 0, value: 2 },
      { x: 150, y: 0, value: 1 },
    ];

    const result = estimateSource(measurements, windDirRad, params);
    expect(result.releaseRate).toBeGreaterThan(0);
  });

  it('handles measurements at different crosswind positions', () => {
    const trueQ = 100;
    const measurements: DataPoint[] = [
      { x: 100, y: 0, value: gaussianPlume(100, 0, { Q: trueQ, ...params }) },
      { x: 100, y: 20, value: gaussianPlume(100, 20, { Q: trueQ, ...params }) },
      { x: 200, y: 0, value: gaussianPlume(200, 0, { Q: trueQ, ...params }) },
    ];

    const result = estimateSource(measurements, windDirRad, params);
    expect(result.sourceX).toBeCloseTo(0, -1);
    expect(result.releaseRate).toBeGreaterThan(0);
  });
});
