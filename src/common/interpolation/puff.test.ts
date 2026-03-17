import { describe, it, expect } from 'vitest';
import {
  gaussianPuff,
  estimatePuffSource,
  puffAlgorithm,
} from './puff';
import type { DataPoint } from './types';

const baseParams = {
  Q: 1000,          // total mass in arbitrary units
  windSpeed: 3,
  stabilityClass: 4, // D = neutral
  releaseHeight: 1,
};

describe('gaussianPuff', () => {
  it('returns positive concentration downwind on centerline', () => {
    // puff center is at d = u*t = 3*60 = 180 m downwind after 60 s
    const c = gaussianPuff(180, 0, 60, baseParams);
    expect(c).toBeGreaterThan(0);
  });

  it('returns zero for negative elapsed time', () => {
    const c = gaussianPuff(100, 0, -1, baseParams);
    expect(c).toBe(0);
  });

  it('returns zero upwind of source (puff has not reached negative downwind)', () => {
    // Query point well upwind; puff center is at +180 m, point at -200 m
    const c = gaussianPuff(-200, 0, 60, baseParams);
    // Should be near zero (many sigma away from puff center)
    expect(c).toBeLessThan(1e-6);
  });

  it('concentration is symmetric about crosswind axis through puff center', () => {
    const d = 3 * 60; // puff center at 180 m
    const c_plus  = gaussianPuff(d, 50, 60, baseParams);
    const c_minus = gaussianPuff(d, -50, 60, baseParams);
    expect(c_plus).toBeCloseTo(c_minus, 10);
  });

  it('concentration decreases with crosswind distance from centerline', () => {
    const d = 3 * 60;
    const c0   = gaussianPuff(d, 0,   60, baseParams);
    const c50  = gaussianPuff(d, 50,  60, baseParams);
    const c200 = gaussianPuff(d, 200, 60, baseParams);
    expect(c0).toBeGreaterThan(c50);
    expect(c50).toBeGreaterThan(c200);
  });

  it('puff disperses (peak concentration decreases) as it travels further', () => {
    // Compare peak concentration at t=60s vs t=300s (puff center shifts, spreads more)
    const d60  = 3 * 60;
    const d300 = 3 * 300;
    const c60  = gaussianPuff(d60,  0, 60,  baseParams);
    const c300 = gaussianPuff(d300, 0, 300, baseParams);
    expect(c60).toBeGreaterThan(c300);
  });

  it('applies deposition decay when depositionTau is set', () => {
    const d = 3 * 60;
    const cNoDecay = gaussianPuff(d, 0, 60, { ...baseParams, depositionTau: 0 });
    const cDecay   = gaussianPuff(d, 0, 60, { ...baseParams, depositionTau: 120 }); // 2-min decay
    expect(cDecay).toBeLessThan(cNoDecay);
    expect(cDecay).toBeGreaterThan(0);
  });

  it('deposition decay with tau=0 means no deposition (disabled)', () => {
    const d = 3 * 60;
    const c1 = gaussianPuff(d, 0, 60, { ...baseParams, depositionTau: 0 });
    const c2 = gaussianPuff(d, 0, 60, baseParams); // no depositionTau key
    expect(c1).toBeCloseTo(c2, 10);
  });

  it('scales linearly with Q', () => {
    const d = 3 * 60;
    const c1 = gaussianPuff(d, 0, 60, { ...baseParams, Q: 1000 });
    const c2 = gaussianPuff(d, 0, 60, { ...baseParams, Q: 2000 });
    expect(c2 / c1).toBeCloseTo(2, 5);
  });
});

describe('estimatePuffSource', () => {
  const windDirRad = Math.PI / 2; // towards east
  const params = {
    windSpeed: 3,
    stabilityClass: 4,
    releaseHeight: 1,
    searchResolution: 10,
    metersPerPixel: 1,
    tElapsed: 120, // 2 minutes
  };

  it('recovers source position from synthetic measurements', () => {
    // True source at (0, 0), puff at t=120s
    const trueQ = 500;
    const measurements: DataPoint[] = [];
    const d = params.windSpeed * params.tElapsed; // 360 m east

    // Sample 5 points near the puff center
    for (const crosswind of [-50, -20, 0, 20, 50]) {
      const x = d;           // downwind = east
      const y = crosswind;
      const value = gaussianPuff(d, crosswind, params.tElapsed, {
        Q: trueQ,
        windSpeed: params.windSpeed,
        stabilityClass: params.stabilityClass,
        releaseHeight: params.releaseHeight,
      });
      // Convert wind-aligned back to map coords (wind blowing east = downwind is +x)
      measurements.push({ x, y, value });
    }

    const result = estimatePuffSource(measurements, windDirRad, params);
    expect(result.sourceX).toBeCloseTo(0, -1); // within ~10 m
    expect(result.sourceY).toBeCloseTo(0, -1);
    expect(result.releaseQuantity).toBeGreaterThan(0);
    expect(result.error).toBeLessThan(1);
  });

  it('returns zero releaseQuantity with no valid points', () => {
    const result = estimatePuffSource([], windDirRad, params);
    expect(result.releaseQuantity).toBe(0);
    expect(result.error).toBe(Infinity);
  });
});

describe('puffAlgorithm', () => {
  it('has correct id and label', () => {
    expect(puffAlgorithm.id).toBe('puff');
    expect(puffAlgorithm.label).toBe('Ausbreitungsprognose');
  });

  it('has required params including timeSinceRelease and predictionOffset', () => {
    const keys = puffAlgorithm.params.map((p) => p.key);
    expect(keys).toContain('windDirection');
    expect(keys).toContain('windSpeed');
    expect(keys).toContain('stabilityClass');
    expect(keys).toContain('timeSinceRelease');
    expect(keys).toContain('predictionOffset');
    expect(keys).toContain('depositionTimeConstant');
  });

  it('prepare returns state with sourceX/sourceY/releaseQuantity', () => {
    const points: DataPoint[] = [
      { x: 300, y: 0,  value: 10 },
      { x: 300, y: 30, value: 5 },
      { x: 300, y: -30, value: 5 },
    ];
    const state = puffAlgorithm.prepare(points, {
      windDirection: 270, // from west → blows east
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 1,
      timeSinceRelease: 2,  // 2 min
      predictionOffset: 0,
      depositionTimeConstant: 0,
      searchResolution: 20,
      fullCanvasRender: false,
      _metersPerPixel: 1,
    });
    expect(state).toHaveProperty('sourceX');
    expect(state).toHaveProperty('sourceY');
    expect(state).toHaveProperty('releaseQuantity');
  });

  it('evaluate returns 0 when releaseQuantity is 0', () => {
    const emptyState = {
      sourceX: 0,
      sourceY: 0,
      releaseQuantity: 0,
      windDirRad: 0,
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 1,
      tElapsed: 120,
      depositionTau: 0,
      metersPerPixel: 1,
      fullCanvasRender: false,
    };
    expect(puffAlgorithm.evaluate(100, 0, emptyState)).toBe(0);
  });

  it('minPoints is at least 2', () => {
    expect(puffAlgorithm.minPoints).toBeGreaterThanOrEqual(2);
  });

  it('rendered peak with predictionOffset > 0 stays within reasonable range of measured values', () => {
    // Regression: Q must be fitted at timeSinceRelease, not timeSinceRelease+predictionOffset.
    // Before the fix, predictionOffset > 0 caused Q to be massively overestimated because
    // estimatePuffSource was called with the future tElapsed, making measurements appear to
    // be in a near-zero region of the puff and forcing Q enormous.
    const points: DataPoint[] = [
      { x: 180, y: 0,  value: 500 },
      { x: 180, y: 30, value: 200 },
      { x: 180, y: -30, value: 200 },
    ];
    const commonParams = {
      windDirection: 270, // blows east
      windSpeed: 3,
      stabilityClass: 4,
      releaseHeight: 1,
      depositionTimeConstant: 0,
      searchResolution: 20,
      fullCanvasRender: false,
      _metersPerPixel: 1,
    };

    const stateNoOffset = puffAlgorithm.prepare(points, { ...commonParams, timeSinceRelease: 1, predictionOffset: 0 });
    const stateWithOffset = puffAlgorithm.prepare(points, { ...commonParams, timeSinceRelease: 1, predictionOffset: 5 });

    // Both should have a similar releaseQuantity — the puff source doesn't change,
    // only the render time does. A 100x inflation indicates the bug is present.
    expect(stateWithOffset.releaseQuantity / stateNoOffset.releaseQuantity).toBeLessThan(10);
  });
});
