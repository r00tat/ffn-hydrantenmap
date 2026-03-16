import { describe, it, expect } from 'vitest';
import { pasquillSigmaY, pasquillSigmaZ } from './ste';

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
