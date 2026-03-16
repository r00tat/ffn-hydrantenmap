import { describe, it, expect, beforeAll } from 'vitest';
import {
  pasquillSigmaY,
  pasquillSigmaZ,
  gaussianPlume,
  estimateSource,
  steAlgorithm,
} from './ste';
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
  // metersPerPixel: 1 means coordinates are already in meters (unit-test convention)
  const params = {
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 10,
    metersPerPixel: 1,
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

describe('STE algorithm interface', () => {
  it('has correct metadata', () => {
    expect(steAlgorithm.id).toBe('ste');
    expect(steAlgorithm.label).toBe('Source Term Estimation');
    expect(steAlgorithm.params.length).toBeGreaterThan(0);
    expect(steAlgorithm.params).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'windDirection' }),
        expect.objectContaining({ key: 'windSpeed' }),
        expect.objectContaining({ key: 'stabilityClass' }),
      ])
    );
  });

  it('does not set fullCanvasRender (renders hull + buffer only)', () => {
    expect(steAlgorithm.fullCanvasRender).toBeFalsy();
  });

  it('has all required param descriptors with defaults', () => {
    for (const param of steAlgorithm.params) {
      expect(param.key).toBeTruthy();
      expect(param.label).toBeTruthy();
      expect(param.default).toBeDefined();
      if (param.type === 'number') {
        expect(param.min).toBeDefined();
        expect(param.max).toBeDefined();
      }
      if (param.type === 'select') {
        expect(param.options).toBeDefined();
        expect(param.options!.length).toBeGreaterThan(0);
      }
    }
  });

  it('prepare + evaluate produces plume-shaped output', () => {
    const points: DataPoint[] = [
      { x: 100, y: 0, value: 5 },
      { x: 200, y: 0, value: 2 },
      { x: 300, y: 0, value: 1 },
    ];

    const state = steAlgorithm.prepare(points, {
      windDirection: 270, // from west
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 0,
      searchResolution: 20,
    });

    const cDownwind = steAlgorithm.evaluate(150, 0, state);
    expect(cDownwind).toBeGreaterThan(0);

    const cCrosswind = steAlgorithm.evaluate(150, 200, state);
    expect(cCrosswind).toBeLessThan(cDownwind);
  });

  it('_metersPerPixel scales pixel coordinates to meters correctly', () => {
    // Place measurements at pixel coords; 1 pixel = 5 meters
    const mpp = 5;
    const points: DataPoint[] = [
      { x: 20, y: 0, value: 5 },  // 100m downwind in meter space
      { x: 40, y: 0, value: 2 },  // 200m
      { x: 60, y: 0, value: 1 },  // 300m
    ];
    const stateWithScale = steAlgorithm.prepare(points, {
      windDirection: 270,
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 0,
      searchResolution: 20,
      _metersPerPixel: mpp,
    });
    // Equivalent meter-space points
    const meterPoints: DataPoint[] = points.map((p) => ({
      x: p.x * mpp,
      y: p.y * mpp,
      value: p.value,
    }));
    const stateMeters = steAlgorithm.prepare(meterPoints, {
      windDirection: 270,
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 0,
      searchResolution: 20,
      _metersPerPixel: 1,
    });
    // Both should produce the same concentration at equivalent positions
    const cPixelSpace = steAlgorithm.evaluate(30, 0, stateWithScale); // px=30 → 150m
    const cMeterSpace = steAlgorithm.evaluate(150, 0, stateMeters);
    expect(cPixelSpace).toBeCloseTo(cMeterSpace, 3);
  });

  it('prepare with default params does not throw', () => {
    const points: DataPoint[] = [
      { x: 50, y: 0, value: 10 },
      { x: 100, y: 0, value: 5 },
    ];
    expect(() => steAlgorithm.prepare(points, {})).not.toThrow();
  });

  it('evaluate returns 0 upwind of source', () => {
    const points: DataPoint[] = [
      { x: 100, y: 0, value: 5 },
      { x: 200, y: 0, value: 2 },
    ];
    const state = steAlgorithm.prepare(points, {
      windDirection: 270,
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 0,
      searchResolution: 20,
    });

    const cUpwind = steAlgorithm.evaluate(-500, 0, state);
    expect(cUpwind).toBe(0);
  });
});

describe('STE 5-marker scenario: plume shape sanity check', () => {
  /**
   * Scenario: known source at (0, 0), Q=500 Bq/s, wind from west (270°, u=3 m/s),
   * stability class D (neutral). Five markers placed at realistic positions
   * with values generated from the Gaussian Plume formula.
   *
   * Coordinate system: 1 pixel = 1 meter (metersPerPixel defaults to 1).
   *
   *   Marker layout (wind → east, i.e. +x):
   *
   *            y
   *            |
   *     M4(150,40) ●
   *            |
   *   source ──┼──── M1(80,0) ── M2(150,0) ── M3(250,0) ──► x (downwind)
   *            |
   *     M5(150,-40) ●
   */
  const trueSource = { x: 0, y: 0 };
  const trueQ = 500;
  const plumeParams = { Q: trueQ, windSpeed: 3, stabilityClass: 4, releaseHeight: 0 };

  // Generate realistic marker values from the true plume
  const markers: DataPoint[] = [
    { x: 80,  y:   0, value: gaussianPlume( 80,   0, plumeParams) }, // close, centerline
    { x: 150, y:   0, value: gaussianPlume(150,   0, plumeParams) }, // mid, centerline
    { x: 250, y:   0, value: gaussianPlume(250,   0, plumeParams) }, // far, centerline
    { x: 150, y:  40, value: gaussianPlume(150,  40, plumeParams) }, // mid, +crosswind
    { x: 150, y: -40, value: gaussianPlume(150, -40, plumeParams) }, // mid, -crosswind
  ];

  const prepParams = {
    windDirection: 270,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 10,
  };

  let state: ReturnType<typeof steAlgorithm.prepare>;
  beforeAll(() => {
    state = steAlgorithm.prepare(markers, prepParams);
  });

  it('all 5 marker values are positive and differ from each other', () => {
    const values = markers.map((m) => m.value);
    for (const v of values) expect(v).toBeGreaterThan(0);
    // Not all the same — there is real variation in the input data
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max / min).toBeGreaterThan(2);
  });

  it('estimates the source near (0, 0)', () => {
    const distFromTrue = Math.sqrt(
      (state.sourceX - trueSource.x) ** 2 + (state.sourceY - trueSource.y) ** 2
    );
    // Grid search resolution is 10m, so allow up to 20m error
    expect(distFromTrue).toBeLessThan(20);
  });

  it('estimates a positive release rate', () => {
    expect(state.releaseRate).toBeGreaterThan(0);
  });

  it('concentration decreases with downwind distance on centerline', () => {
    const c80  = steAlgorithm.evaluate( 80, 0, state);
    const c150 = steAlgorithm.evaluate(150, 0, state);
    const c250 = steAlgorithm.evaluate(250, 0, state);
    expect(c80).toBeGreaterThan(c150);
    expect(c150).toBeGreaterThan(c250);
  });

  it('centerline concentration is higher than off-centerline at same downwind distance', () => {
    const cCenter   = steAlgorithm.evaluate(150,  0, state);
    const cOffLeft  = steAlgorithm.evaluate(150,  40, state);
    const cOffRight = steAlgorithm.evaluate(150, -40, state);
    expect(cCenter).toBeGreaterThan(cOffLeft);
    expect(cCenter).toBeGreaterThan(cOffRight);
  });

  it('plume is symmetric about the centerline', () => {
    const cLeft  = steAlgorithm.evaluate(150,  40, state);
    const cRight = steAlgorithm.evaluate(150, -40, state);
    expect(cLeft).toBeCloseTo(cRight, 5);
  });

  it('upwind of source returns 0', () => {
    expect(steAlgorithm.evaluate(-100, 0, state)).toBe(0);
    expect(steAlgorithm.evaluate(-300, 0, state)).toBe(0);
  });

  it('concentration far off-axis is negligible compared to centerline', () => {
    const cCenter  = steAlgorithm.evaluate(150,   0, state);
    const cFarSide = steAlgorithm.evaluate(150, 300, state);
    expect(cFarSide).toBeLessThan(cCenter * 0.01);
  });
});
