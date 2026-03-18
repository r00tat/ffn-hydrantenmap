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

  it('returns small positive concentration upwind (along-wind diffusion)', () => {
    const cUpwind = gaussianPlume(-100, 0, baseParams);
    expect(cUpwind).toBeGreaterThan(0);
    // Much smaller than downwind at same distance
    const cDownwind = gaussianPlume(100, 0, baseParams);
    expect(cUpwind).toBeLessThan(cDownwind * 0.5);
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

  it('returns positive concentration at source location', () => {
    const c = gaussianPlume(0, 0, baseParams);
    expect(c).toBeGreaterThan(0);
  });
});

describe('Along-wind dispersion (sigma_x)', () => {
  const baseParams = {
    Q: 100,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
  };

  it('upwind concentration decays with distance from source', () => {
    const c10 = gaussianPlume(-10, 0, baseParams);
    const c50 = gaussianPlume(-50, 0, baseParams);
    const c200 = gaussianPlume(-200, 0, baseParams);
    expect(c10).toBeGreaterThan(c50);
    expect(c50).toBeGreaterThan(c200);
  });

  it('near-source dispersion is quasi-isotropic at short distances', () => {
    // At 5m, upwind and downwind concentrations should be similar (within 10x)
    const cDown5 = gaussianPlume(5, 0, baseParams);
    const cUp5 = gaussianPlume(-5, 0, baseParams);
    expect(cUp5).toBeGreaterThan(cDown5 * 0.1);
  });

  it('upwind effect is stronger at low wind speeds', () => {
    const lowWind = { ...baseParams, windSpeed: 0.5 };
    const highWind = { ...baseParams, windSpeed: 5 };
    // At 20m upwind, low-wind should give relatively higher fraction
    const upLow = gaussianPlume(-20, 0, lowWind);
    const downLow = gaussianPlume(20, 0, lowWind);
    const upHigh = gaussianPlume(-20, 0, highWind);
    const downHigh = gaussianPlume(20, 0, highWind);
    expect(upLow / downLow).toBeGreaterThan(upHigh / downHigh);
  });

  it('downwind values are unchanged (regression check)', () => {
    // Pre-computed values for downwind with Q=100, u=3, D-class, H=0
    const c100 = gaussianPlume(100, 0, baseParams);
    // These should match the standard Gaussian plume exactly
    const sigmaY100 = pasquillSigmaY(100, 4);
    const sigmaZ100 = pasquillSigmaZ(100, 4);
    const expected100 = 100 / (2 * Math.PI * 3 * sigmaY100 * sigmaZ100);
    expect(c100).toBeCloseTo(expected100, 10);
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
    // Meter-space grid alignment may find a slightly different optimum.
    // With 20m grid steps, the result can be up to ~2 grid steps from the true source.
    expect(Math.abs(result.sourceX)).toBeLessThan(50);
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

  it('fullCanvasRender is a function (driven by user param)', () => {
    expect(typeof steAlgorithm.fullCanvasRender).toBe('function');
  });

  it('has a fullCanvasRender boolean param with default true', () => {
    const param = steAlgorithm.params.find((p) => p.key === 'fullCanvasRender');
    expect(param).toBeDefined();
    expect(param!.type).toBe('boolean');
    expect(param!.default).toBe(true);
  });

  it('fullCanvasRender(state) returns false when param is false (default)', () => {
    const points: DataPoint[] = [
      { x: 100, y: 0, value: 5 },
      { x: 200, y: 0, value: 2 },
    ];
    const state = steAlgorithm.prepare(points, { fullCanvasRender: false });
    const fn = steAlgorithm.fullCanvasRender as (s: unknown) => boolean;
    expect(fn(state)).toBe(false);
  });

  it('fullCanvasRender(state) returns true when param is true', () => {
    const points: DataPoint[] = [
      { x: 100, y: 0, value: 5 },
      { x: 200, y: 0, value: 2 },
    ];
    const state = steAlgorithm.prepare(points, { fullCanvasRender: true });
    const fn = steAlgorithm.fullCanvasRender as (s: unknown) => boolean;
    expect(fn(state)).toBe(true);
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

  it('evaluate returns near-zero far upwind, positive close to source', () => {
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

    const cFarUpwind = steAlgorithm.evaluate(-500, 0, state);
    const cDownwind = steAlgorithm.evaluate(150, 0, state);
    expect(cFarUpwind).toBeGreaterThanOrEqual(0);
    expect(cFarUpwind).toBeLessThan(cDownwind * 0.01);
    expect(cDownwind).toBeGreaterThan(0);
  });
});

describe('STE 5-marker scenario: scattered field measurements', () => {
  /**
   * Simulates a team taking measurements at different positions around an
   * incident — not lined up, not symmetric. Positions are like street corners
   * or vehicle locations scattered in the downwind area.
   *
   * True source at (0,0), wind from west (→ east, +x).
   * Markers at irregular positions, all to the east of the source:
   *
   *           y
   *     M4(150,60) ●
   *           |
   *  src ─────┼──── M1(80,-20) ──── M3(200,10)
   *           |
   *     M2(120,-50) ●
   *           |
   *     M5(100,-45) ●
   *
   * None of the 5 markers are on the same line.
   * Values are generated from the true Gaussian Plume.
   */
  const trueQ = 300;
  const plumeBase = { Q: trueQ, windSpeed: 3, stabilityClass: 4, releaseHeight: 0 };
  const prepParams = {
    windDirection: 270,
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 10,
  };

  const markers: DataPoint[] = [
    { x:  80, y: -20, value: gaussianPlume( 80, -20, plumeBase) },
    { x: 120, y: -50, value: gaussianPlume(120, -50, plumeBase) },
    { x: 200, y:  10, value: gaussianPlume(200,  10, plumeBase) },
    { x: 150, y:  60, value: gaussianPlume(150,  60, plumeBase) },
    { x: 100, y: -45, value: gaussianPlume(100, -45, plumeBase) },
  ];

  let state: ReturnType<typeof steAlgorithm.prepare>;
  beforeAll(() => { state = steAlgorithm.prepare(markers, prepParams); });

  it('all 5 markers have positive values with meaningful variation', () => {
    const vals = markers.map((m) => m.value);
    for (const v of vals) expect(v).toBeGreaterThan(0);
    // Markers at different distances and crosswind offsets → values vary
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    expect(max / min).toBeGreaterThan(3);
  });

  it('source is estimated within 50m of the true source (0,0)', () => {
    const dist = Math.sqrt(state.sourceX ** 2 + state.sourceY ** 2);
    expect(dist).toBeLessThan(50);
  });

  it('release rate is positive', () => {
    expect(state.releaseRate).toBeGreaterThan(0);
  });

  it('estimated release rate is in the right order of magnitude', () => {
    // Scattered markers have less constraint than an inline set, so allow
    // a factor-of-10 window around the true Q=300.
    expect(state.releaseRate).toBeGreaterThan(trueQ / 10);
    expect(state.releaseRate).toBeLessThan(trueQ * 10);
  });

  it('evaluate returns near-zero far upwind, positive near source', () => {
    expect(steAlgorithm.evaluate(  80, -20, state)).toBeGreaterThan(0);
    expect(steAlgorithm.evaluate( 200,  10, state)).toBeGreaterThan(0);
    // Far upwind: very small but may be >= 0
    const cFarUpwind = steAlgorithm.evaluate(-300, 0, state);
    const cDownwind = steAlgorithm.evaluate(80, -20, state);
    expect(cFarUpwind).toBeLessThan(cDownwind * 0.01);
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

  it('concentration at M1 (close, centerline) > M3 (far, centerline)', () => {
    const nearM1 = steAlgorithm.evaluate( 80, 0, state);
    const nearM3 = steAlgorithm.evaluate(250, 0, state);
    expect(nearM1).toBeGreaterThan(nearM3);
  });

  it('plume is symmetric: equal crosswind positions produce equal concentrations', () => {
    const cPlus  = steAlgorithm.evaluate(150,  80, state);
    const cMinus = steAlgorithm.evaluate(150, -80, state);
    expect(cPlus).toBeCloseTo(cMinus, 5);
  });
});

describe('STE source estimation with upwind measurement points', () => {
  /**
   * Scenario: source at (0, 0), wind from west (270°, → east) at 1 m/s.
   * Low wind speed makes along-wind diffusion significant, so upwind
   * markers get meaningful (but still smaller) concentrations.
   * Most markers are downwind (east), but two markers are upwind (west)
   * with low values (background readings). The algorithm must still
   * estimate the source near (0, 0) instead of pushing it far west.
   *
   *       M_up2(-80,30) ●           y
   *                   |             |
   *   M_up1(-50,0) ● ── src ──── M1(80,0) ── M2(200,0) ──► x (downwind)
   *                                 |
   *                          M3(120,-40) ●
   */
  const trueQ = 300;
  const plumeBase = { Q: trueQ, windSpeed: 1, stabilityClass: 4, releaseHeight: 0 };
  const prepParams = {
    windDirection: 270,
    windSpeed: 1,
    stabilityClass: 4,
    releaseHeight: 0,
    searchResolution: 10,
  };

  const markers: DataPoint[] = [
    { x:  80, y:   0, value: gaussianPlume( 80,   0, plumeBase) },
    { x: 200, y:   0, value: gaussianPlume(200,   0, plumeBase) },
    { x: 120, y: -40, value: gaussianPlume(120, -40, plumeBase) },
    // Upwind points — get small values from along-wind diffusion
    { x: -50, y:   0, value: gaussianPlume(-50,   0, plumeBase) },
    { x: -80, y:  30, value: gaussianPlume(-80,  30, plumeBase) },
  ];

  let state: ReturnType<typeof steAlgorithm.prepare>;
  beforeAll(() => { state = steAlgorithm.prepare(markers, prepParams); });

  it('upwind markers have small but positive values', () => {
    const upwindValues = markers.filter(m => m.x < 0).map(m => m.value);
    for (const v of upwindValues) expect(v).toBeGreaterThan(0);
    // Upwind values should be much smaller than downwind
    const downwindMax = Math.max(...markers.filter(m => m.x > 0).map(m => m.value));
    for (const v of upwindValues) expect(v).toBeLessThan(downwindMax * 0.5);
  });

  it('source is estimated within 50m of true source (0, 0)', () => {
    const dist = Math.sqrt(state.sourceX ** 2 + state.sourceY ** 2);
    expect(dist).toBeLessThan(50);
  });

  it('source is NOT pushed far upwind by upwind measurements', () => {
    // The old bug: source was forced far west (negative x) to keep
    // all points downwind. Now it should be near 0.
    expect(state.sourceX).toBeGreaterThan(-50);
  });

  it('release rate is in the right order of magnitude', () => {
    expect(state.releaseRate).toBeGreaterThan(trueQ / 10);
    expect(state.releaseRate).toBeLessThan(trueQ * 10);
  });
});
