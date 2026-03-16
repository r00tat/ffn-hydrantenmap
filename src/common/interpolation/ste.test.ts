import { describe, it, expect } from 'vitest';
import { pasquillSigmaY, pasquillSigmaZ, gaussianPlume } from './ste';

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
