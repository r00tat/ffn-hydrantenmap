# Ausbreitungsprognose Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new `puff` interpolation algorithm that models a Gaussian Puff (transient cloud) and renders where it will be at a configurable future time, fitted directly to measurement points.

**Architecture:** The algorithm follows the existing `InterpolationAlgorithm<TState>` interface pattern. It re-uses Pasquill-Gifford dispersion functions from `ste.ts` (export them). The puff source position and total mass Q are found by grid search fitting `gaussianPuff()` to the measurement data at `t_elapsed`. `evaluate()` then renders the puff snapshot for any (x, y) at the same `t_elapsed`.

**Tech Stack:** TypeScript, Vitest (TDD), existing `src/common/interpolation/` module.

---

## Working directory

All work is in:
```
.worktrees/feature/ausbreitungsprognose/
```

Run tests with:
```bash
NO_COLOR=1 npm run test
```

---

### Task 1: Export shared helpers from `ste.ts`

`ste.ts` has `pasquillSigmaY`, `pasquillSigmaZ`, and `windFromDegreesToRad` as non-exported functions that the puff module needs to import. Export them.

**Files:**
- Modify: `src/common/interpolation/ste.ts`
- Modify: `src/common/interpolation/index.ts`

**Step 1: Make functions exported in ste.ts**

In `src/common/interpolation/ste.ts`, change the three function declarations:

```typescript
// BEFORE (all three are unexported):
function windFromDegreesToRad(degrees: number): number {
// pasquillSigmaY and pasquillSigmaZ are already exported — just check windFromDegreesToRad

// Verify current state first:
```

Actually — `pasquillSigmaY` and `pasquillSigmaZ` are already exported (the test file imports them). Only `windFromDegreesToRad` needs to be exported.

In `src/common/interpolation/ste.ts`, find:
```typescript
function windFromDegreesToRad(degrees: number): number {
```
Change to:
```typescript
export function windFromDegreesToRad(degrees: number): number {
```

**Step 2: Re-export from index.ts**

In `src/common/interpolation/index.ts`, update the ste line:
```typescript
// BEFORE:
export { steAlgorithm } from './ste';

// AFTER:
export { steAlgorithm, windFromDegreesToRad } from './ste';
```

**Step 3: Run tests to confirm nothing broke**

```bash
NO_COLOR=1 npm run test
```
Expected: 15 files, 166 tests — all pass.

**Step 4: Commit**

```bash
git add src/common/interpolation/ste.ts src/common/interpolation/index.ts
git commit -m "refactor: export windFromDegreesToRad from ste.ts"
```

---

### Task 2: Write failing tests for gaussianPuff()

Create the test file first (TDD). The `gaussianPuff()` function takes `(downwind, crosswind, tElapsed, params)` and returns concentration.

**Files:**
- Create: `src/common/interpolation/puff.test.ts`

**Step 1: Create the test file**

```typescript
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
});
```

**Step 2: Run to confirm all fail (module not found)**

```bash
NO_COLOR=1 npm run test -- src/common/interpolation/puff.test.ts
```
Expected: FAIL — "Cannot find module './puff'"

**Step 3: Commit the test file**

```bash
git add src/common/interpolation/puff.test.ts
git commit -m "test: add failing tests for Gaussian Puff algorithm (TDD)"
```

---

### Task 3: Implement `gaussianPuff()` and `estimatePuffSource()`

Create the implementation that makes the tests pass.

**Files:**
- Create: `src/common/interpolation/puff.ts`

**Step 1: Create puff.ts**

```typescript
import type { DataPoint, InterpolationAlgorithm } from './types';
import { pasquillSigmaY, pasquillSigmaZ, windFromDegreesToRad } from './ste';

export interface GaussianPuffParams {
  Q: number;
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Deposition time constant in seconds. 0 = no deposition. */
  depositionTau?: number;
}

/**
 * Gaussian Puff concentration at a point in wind-aligned coordinates at time tElapsed.
 *
 * The puff center has traveled d = windSpeed * tElapsed meters downwind.
 * Dispersion coefficients are computed at distance d using Pasquill-Gifford.
 * Along-wind spread σx is approximated as equal to σy (standard simplification).
 *
 * @param downwind  - downwind coordinate relative to source (m)
 * @param crosswind - crosswind coordinate relative to source (m)
 * @param tElapsed  - seconds since release
 * @param params
 */
export function gaussianPuff(
  downwind: number,
  crosswind: number,
  tElapsed: number,
  params: GaussianPuffParams
): number {
  if (tElapsed <= 0) return 0;

  const { Q, windSpeed, stabilityClass, releaseHeight, depositionTau } = params;
  const u = Math.max(0.1, windSpeed);

  // Distance traveled by puff center
  const d = u * tElapsed;

  const sigmaY = pasquillSigmaY(d, stabilityClass);
  const sigmaZ = pasquillSigmaZ(d, stabilityClass);
  const sigmaX = sigmaY; // along-wind spread ≈ lateral spread

  // Downwind displacement from puff center
  const dx = downwind - d;

  const downwindTerm = Math.exp(-(dx * dx) / (2 * sigmaX * sigmaX));
  const crosswindTerm = Math.exp(-(crosswind * crosswind) / (2 * sigmaY * sigmaY));
  // Vertical: ground reflection (factor 2), evaluated at z=0
  const verticalTerm = 2 * Math.exp(-(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ));

  const concentration =
    (Q / (Math.pow(2 * Math.PI, 1.5) * sigmaX * sigmaY * sigmaZ)) *
    downwindTerm *
    crosswindTerm *
    verticalTerm;

  // Optional first-order deposition decay
  if (depositionTau && depositionTau > 0) {
    return concentration * Math.exp(-tElapsed / depositionTau);
  }
  return concentration;
}

export interface PuffSourceEstimate {
  sourceX: number;
  sourceY: number;
  releaseQuantity: number;
  error: number;
}

interface PuffSearchParams {
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Grid search step in meters */
  searchResolution: number;
  /** Real-world scale: meters per pixel */
  metersPerPixel: number;
  /** Elapsed time in seconds (timeSinceRelease + predictionOffset) */
  tElapsed: number;
}

/**
 * Transform (px, py) from map coords to wind-aligned coords relative to a candidate source.
 * Returns [downwind, crosswind] in meters.
 */
function toWindCoords(
  px: number,
  py: number,
  srcX: number,
  srcY: number,
  windDirRad: number,
  mpp: number
): [number, number] {
  const dx = (px - srcX) * mpp;
  const dy = (py - srcY) * mpp;
  const downwind = dx * Math.sin(windDirRad) + dy * Math.cos(windDirRad);
  const crosswind = dx * Math.cos(windDirRad) - dy * Math.sin(windDirRad);
  return [downwind, crosswind];
}

/**
 * Estimate source position and total released mass Q from measurement points.
 * Fits the Gaussian Puff model at tElapsed via grid-search + log-space least-squares.
 * Requires at least 2 positive measurement points for meaningful results.
 */
export function estimatePuffSource(
  points: DataPoint[],
  windDirRad: number,
  params: PuffSearchParams
): PuffSourceEstimate {
  if (points.length === 0) {
    return { sourceX: 0, sourceY: 0, releaseQuantity: 0, error: Infinity };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const extent = Math.max(maxX - minX, maxY - minY, 100);
  const buffer = extent * 1.5;
  const mpp = Math.max(params.metersPerPixel, 1e-6);
  const res = params.searchResolution / mpp;

  let gMinX = Math.floor((minX - buffer) / res) * res;
  let gMaxX = Math.ceil((maxX + buffer) / res) * res;
  let gMinY = Math.floor((minY - buffer) / res) * res;
  let gMaxY = Math.ceil((maxY + buffer) / res) * res;

  const unitParams: GaussianPuffParams = {
    Q: 1,
    windSpeed: params.windSpeed,
    stabilityClass: params.stabilityClass,
    releaseHeight: params.releaseHeight,
  };

  let maxMeasurement = 0;
  for (const p of points) {
    if (p.value > maxMeasurement) maxMeasurement = p.value;
  }
  const dataFloor = Math.max(maxMeasurement * 0.001, 1e-9);

  let bestError = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestQ = 0;

  for (let cx = gMinX; cx <= gMaxX; cx += res) {
    for (let cy = gMinY; cy <= gMaxY; cy += res) {
      const unitConcs: number[] = [];
      let valid = true;

      for (const p of points) {
        const [downwind, crosswind] = toWindCoords(p.x, p.y, cx, cy, windDirRad, mpp);
        const c = gaussianPuff(downwind, crosswind, params.tElapsed, unitParams);
        unitConcs.push(c);
        if (c <= 0) { valid = false; break; }
      }

      if (!valid) continue;

      // Estimate Q from positive measurements via log-space least-squares
      let sumLogRatio = 0;
      let posCount = 0;
      for (let i = 0; i < points.length; i++) {
        if (points[i].value <= 0) continue;
        sumLogRatio += Math.log(points[i].value) - Math.log(unitConcs[i]);
        posCount++;
      }
      if (posCount === 0) continue;

      const Q = Math.exp(sumLogRatio / posCount);
      if (Q <= 0) continue;

      let error = 0;
      for (let i = 0; i < points.length; i++) {
        const logPred = Math.log(Q * unitConcs[i]);
        const logObs = Math.log(Math.max(points[i].value, dataFloor));
        const diff = logPred - logObs;
        error += diff * diff;
      }

      if (error < bestError) {
        bestError = error;
        bestX = cx;
        bestY = cy;
        bestQ = Q;
      }
    }
  }

  return {
    sourceX: bestX,
    sourceY: bestY,
    releaseQuantity: bestQ,
    error: bestError,
  };
}

interface PuffState {
  sourceX: number;
  sourceY: number;
  releaseQuantity: number;
  windDirRad: number;
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  /** Total elapsed time in seconds (timeSinceRelease + predictionOffset) */
  tElapsed: number;
  /** Deposition time constant in seconds (0 = disabled) */
  depositionTau: number;
  metersPerPixel: number;
  fullCanvasRender: boolean;
}

export const puffAlgorithm: InterpolationAlgorithm<PuffState> = {
  id: 'puff',
  label: 'Ausbreitungsprognose',
  description:
    'Prognostiziert die Position und Konzentration einer Schadstoffwolke (Gauß-Puff-Modell) zu einem wählbaren Zeitpunkt. Schätzt Quellort und freigesetzte Masse aus Messwerten und berechnet die Ausbreitung unter Berücksichtigung von Wind, Stabilitätsklasse und atmosphärischer Ablagerung.',
  minPoints: 2,
  params: [
    {
      key: 'windDirection',
      label: 'Windrichtung (°, woher)',
      type: 'number',
      min: 0,
      max: 360,
      step: 5,
      default: 270,
    },
    {
      key: 'windSpeed',
      label: 'Windgeschwindigkeit (m/s)',
      type: 'number',
      min: 0,
      max: 30,
      step: 0.5,
      default: 3,
    },
    {
      key: 'stabilityClass',
      label: 'Stabilitätsklasse',
      type: 'select',
      options: [
        { value: 1, label: 'A – sehr labil (sonnig, schwach windig)' },
        { value: 2, label: 'B – labil (sonnig, mäßig windig)' },
        { value: 3, label: 'C – leicht labil (bewölkt, windig)' },
        { value: 4, label: 'D – neutral (bedeckt oder windig)' },
        { value: 5, label: 'E – leicht stabil (Nacht, leichter Wind)' },
        { value: 6, label: 'F – stabil (klare Nacht, windstill)' },
      ],
      default: 4,
    },
    {
      key: 'releaseHeight',
      label: 'Quellhöhe (m)',
      type: 'number',
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
    {
      key: 'timeSinceRelease',
      label: 'Zeit seit Freisetzung (min)',
      type: 'number',
      min: 0,
      max: 240,
      step: 1,
      default: 30,
    },
    {
      key: 'predictionOffset',
      label: 'Prognose-Horizont (min)',
      type: 'number',
      min: 0,
      max: 120,
      step: 1,
      default: 0,
    },
    {
      key: 'depositionTimeConstant',
      label: 'Ablagerungszeitkonstante (min, 0=keine)',
      type: 'number',
      min: 0,
      max: 120,
      step: 1,
      default: 0,
    },
    {
      key: 'searchResolution',
      label: 'Suchraster (m)',
      type: 'number',
      min: 5,
      max: 50,
      step: 5,
      default: 20,
    },
    {
      key: 'fullCanvasRender',
      label: 'Gesamte Karte rendern (Wolkenform über Messbereich hinaus)',
      type: 'boolean',
      default: false,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): PuffState {
    const windDir = typeof params.windDirection === 'number' ? params.windDirection : 270;
    const windSpeed = typeof params.windSpeed === 'number' ? params.windSpeed : 3;
    const stabilityClass = typeof params.stabilityClass === 'number' ? params.stabilityClass : 4;
    const releaseHeight = typeof params.releaseHeight === 'number' ? params.releaseHeight : 1;
    const timeSinceRelease = typeof params.timeSinceRelease === 'number' ? params.timeSinceRelease : 30;
    const predictionOffset = typeof params.predictionOffset === 'number' ? params.predictionOffset : 0;
    const depositionTimeConstant = typeof params.depositionTimeConstant === 'number' ? params.depositionTimeConstant : 0;
    const searchResolution = typeof params.searchResolution === 'number' ? params.searchResolution : 20;
    const metersPerPixel = typeof params._metersPerPixel === 'number' ? params._metersPerPixel : 1;
    const fullCanvasRender = !!params.fullCanvasRender;

    const windDirRad = windFromDegreesToRad(windDir);
    // Convert minutes to seconds
    const tElapsed = (timeSinceRelease + predictionOffset) * 60;
    const depositionTau = depositionTimeConstant * 60;

    const estimate = estimatePuffSource(points, windDirRad, {
      windSpeed,
      stabilityClass,
      releaseHeight,
      searchResolution,
      metersPerPixel,
      tElapsed,
    });

    return {
      sourceX: estimate.sourceX,
      sourceY: estimate.sourceY,
      releaseQuantity: estimate.releaseQuantity,
      windDirRad,
      windSpeed,
      stabilityClass,
      releaseHeight,
      tElapsed,
      depositionTau,
      metersPerPixel,
      fullCanvasRender,
    };
  },

  fullCanvasRender(state: PuffState): boolean {
    return state.fullCanvasRender;
  },

  evaluate(x: number, y: number, state: PuffState): number {
    if (state.releaseQuantity < 1e-9) return 0;

    const mpp = Math.max(state.metersPerPixel, 1e-6);
    const dx = (x - state.sourceX) * mpp;
    const dy = (y - state.sourceY) * mpp;
    const downwind = dx * Math.sin(state.windDirRad) + dy * Math.cos(state.windDirRad);
    const crosswind = dx * Math.cos(state.windDirRad) - dy * Math.sin(state.windDirRad);

    return gaussianPuff(downwind, crosswind, state.tElapsed, {
      Q: state.releaseQuantity,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
      depositionTau: state.depositionTau > 0 ? state.depositionTau : undefined,
    });
  },
};
```

**Step 2: Run tests**

```bash
NO_COLOR=1 npm run test -- src/common/interpolation/puff.test.ts
```
Expected: All puff tests pass.

**Step 3: Run full suite**

```bash
NO_COLOR=1 npm run test
```
Expected: 16 files, all pass.

**Step 4: Commit**

```bash
git add src/common/interpolation/puff.ts
git commit -m "feat: implement Gaussian Puff algorithm (Ausbreitungsprognose)"
```

---

### Task 4: Register the algorithm in index.ts

**Files:**
- Modify: `src/common/interpolation/index.ts`

**Step 1: Add import and registration**

In `src/common/interpolation/index.ts`, add after the existing ste/invSquare lines:

```typescript
// In the export block, add:
export { puffAlgorithm, gaussianPuff, estimatePuffSource } from './puff';
export type { GaussianPuffParams, PuffSourceEstimate } from './puff';

// In the import block at bottom, add:
import { puffAlgorithm } from './puff';

// After registerAlgorithm(invSquareAlgorithm), add:
registerAlgorithm(puffAlgorithm);
```

**Step 2: Run full test suite**

```bash
NO_COLOR=1 npm run test
```
Expected: All pass, no regressions.

**Step 3: Run lint**

```bash
npm run lint
```
Expected: No errors.

**Step 4: Commit**

```bash
git add src/common/interpolation/index.ts
git commit -m "feat: register puff algorithm in interpolation registry"
```

---

### Task 5: Verify end-to-end in registry test

Check that `registry.test.ts` already covers algorithm registration generically (it likely does). If the registry test enumerates algorithms by ID, add `'puff'` to the expected list.

**Files:**
- Read: `src/common/interpolation/registry.test.ts`
- Modify if needed: `src/common/interpolation/registry.test.ts`

**Step 1: Check registry test**

```bash
cat src/common/interpolation/registry.test.ts
```

If the test checks for a specific list of IDs, add `'puff'`. If it only tests registration mechanics generically, no change needed.

**Step 2: Run tests**

```bash
NO_COLOR=1 npm run test
```
Expected: All pass.

**Step 3: Commit if changed**

```bash
git add src/common/interpolation/registry.test.ts
git commit -m "test: update registry test to include puff algorithm"
```

---

## Done

The `puffAlgorithm` is now available in the interpolation registry. It will appear automatically in the `HeatmapSettings` dropdown alongside IDW, Spline, Kriging, STE, and InvSquare — no UI changes needed.

**To verify manually:** Start the dev server with `npm run dev`, open a heatmap layer with numeric measurement points, and select "Ausbreitungsprognose" from the algorithm dropdown. Adjust "Zeit seit Freisetzung" and "Prognose-Horizont" to see the puff cloud travel downwind.
