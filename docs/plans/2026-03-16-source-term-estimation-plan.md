# Source Term Estimation (STE) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inverse Source Term Estimation algorithm that estimates emission source location and strength from measurement points using a Gaussian Plume model.

**Architecture:** New algorithm module `ste.ts` implementing the `InterpolationAlgorithm<SteState>` interface. Grid search over candidate source positions with analytical Q-solve at each. Gaussian Plume dispersion model with Pasquill-Gifford coefficients. Registered in the barrel index.

**Tech Stack:** TypeScript, Vitest for tests, no external dependencies.

**Worktree:** `.worktrees/feature/ste` (branch `feature/ste` based on `feature/interpolation`)

---

### Task 1: Pasquill-Gifford Dispersion Coefficients — Tests

**Files:**
- Create: `src/common/interpolation/ste.test.ts`

**Step 1: Write failing tests for dispersion coefficients**

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: FAIL — cannot find module `../ste`

**Step 3: Commit test file**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.test.ts
git commit -m "test: add Pasquill-Gifford dispersion coefficient tests for STE"
```

---

### Task 2: Pasquill-Gifford Dispersion Coefficients — Implementation

**Files:**
- Create: `src/common/interpolation/ste.ts`

**Step 1: Implement the dispersion coefficient functions**

```typescript
import type { DataPoint, InterpolationAlgorithm } from './types';

/**
 * Pasquill-Gifford horizontal dispersion coefficient sigma_y.
 * Power-law parameterization: sigma_y = a * x^b
 * Coefficients from Turner (1970).
 *
 * @param x  Downwind distance in meters (clamped to >= 1)
 * @param stabilityClass  1=A (very unstable) through 6=F (very stable)
 */
// Coefficients [a, b] for classes A(1) through F(6)
const SY_COEFFS: [number, number][] = [
  [0.3658, 0.9031], // A
  [0.2751, 0.9031], // B
  [0.2090, 0.9031], // C
  [0.1471, 0.9031], // D
  [0.1046, 0.9031], // E
  [0.0722, 0.9031], // F
];

// sigma_z coefficients [a, b] — more variation by stability
const SZ_COEFFS: [number, number][] = [
  [0.192, 1.2822],  // A
  [0.156, 1.0542],  // B
  [0.116, 0.9145],  // C
  [0.079, 0.7954],  // D
  [0.063, 0.7046],  // E
  [0.053, 0.6325],  // F
];

const MIN_SIGMA = 0.1;

export function pasquillSigmaY(x: number, stabilityClass: number): number {
  const idx = Math.max(0, Math.min(5, Math.round(stabilityClass) - 1));
  const [a, b] = SY_COEFFS[idx];
  const dist = Math.max(1, x);
  return Math.max(MIN_SIGMA, a * Math.pow(dist, b));
}

export function pasquillSigmaZ(x: number, stabilityClass: number): number {
  const idx = Math.max(0, Math.min(5, Math.round(stabilityClass) - 1));
  const [a, b] = SZ_COEFFS[idx];
  const dist = Math.max(1, x);
  return Math.max(MIN_SIGMA, a * Math.pow(dist, b));
}
```

**Step 2: Run tests to verify they pass**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.ts
git commit -m "feat: add Pasquill-Gifford dispersion coefficient functions"
```

---

### Task 3: Gaussian Plume Concentration Function — Tests

**Files:**
- Modify: `src/common/interpolation/ste.test.ts`

**Step 1: Add tests for the Gaussian Plume function**

Append to the test file:

```typescript
import { gaussianPlume } from './ste';

describe('Gaussian Plume concentration', () => {
  const baseParams = {
    Q: 100,           // release rate
    windSpeed: 3,     // m/s
    stabilityClass: 4, // D
    releaseHeight: 0,  // ground level
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
```

**Step 2: Run tests to verify new tests fail**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: Pasquill tests PASS, Gaussian Plume tests FAIL — `gaussianPlume` not exported

**Step 3: Commit test additions**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.test.ts
git commit -m "test: add Gaussian Plume concentration function tests"
```

---

### Task 4: Gaussian Plume Concentration Function — Implementation

**Files:**
- Modify: `src/common/interpolation/ste.ts`

**Step 1: Implement the Gaussian Plume function**

Add to `ste.ts`:

```typescript
export interface GaussianPlumeParams {
  Q: number;              // Release rate (arbitrary units)
  windSpeed: number;      // m/s
  stabilityClass: number; // 1-6
  releaseHeight: number;  // meters
}

/**
 * Gaussian Plume concentration at a point in wind-aligned coordinates.
 *
 * @param downwind   Distance along wind direction (m). Negative = upwind.
 * @param crosswind  Perpendicular distance from plume centerline (m).
 * @param params     Plume parameters.
 * @returns Concentration (proportional to Q, arbitrary units).
 */
export function gaussianPlume(
  downwind: number,
  crosswind: number,
  params: GaussianPlumeParams
): number {
  if (downwind <= 0) return 0;

  const { Q, windSpeed, stabilityClass, releaseHeight } = params;
  const u = Math.max(0.1, windSpeed);

  const sigmaY = pasquillSigmaY(downwind, stabilityClass);
  const sigmaZ = pasquillSigmaZ(downwind, stabilityClass);

  const crosswindTerm = Math.exp(
    -(crosswind * crosswind) / (2 * sigmaY * sigmaY)
  );
  const verticalTerm = Math.exp(
    -(releaseHeight * releaseHeight) / (2 * sigmaZ * sigmaZ)
  );

  return (Q / (2 * Math.PI * u * sigmaY * sigmaZ)) * crosswindTerm * verticalTerm;
}
```

**Step 2: Run tests to verify they pass**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.ts
git commit -m "feat: add Gaussian Plume concentration function"
```

---

### Task 5: Source Estimation via Grid Search — Tests

**Files:**
- Modify: `src/common/interpolation/ste.test.ts`

**Step 1: Add tests for source estimation**

Append to test file:

```typescript
import { estimateSource } from './ste';

describe('Source estimation (grid search)', () => {
  // Wind blowing from west (270°) → towards east
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
    // Place measurements downwind (east) at known plume concentrations
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

    // Source should be estimated near (0, 0)
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
```

**Step 2: Run tests to verify new tests fail**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: FAIL — `estimateSource` not exported

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.test.ts
git commit -m "test: add source estimation grid search tests"
```

---

### Task 6: Source Estimation via Grid Search — Implementation

**Files:**
- Modify: `src/common/interpolation/ste.ts`

**Step 1: Implement estimateSource**

Add to `ste.ts`:

```typescript
export interface SourceEstimate {
  sourceX: number;
  sourceY: number;
  releaseRate: number;
  error: number;
}

interface SearchParams {
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  searchResolution: number;
}

/**
 * Transform (px, py) from global coords to wind-aligned coords relative to a candidate source.
 * Returns [downwind, crosswind].
 */
function toWindCoords(
  px: number,
  py: number,
  srcX: number,
  srcY: number,
  windDirRad: number
): [number, number] {
  const dx = px - srcX;
  const dy = py - srcY;
  // windDirRad points in the "towards" direction (where wind blows to)
  const downwind = dx * Math.cos(windDirRad) + dy * Math.sin(windDirRad);
  const crosswind = -dx * Math.sin(windDirRad) + dy * Math.cos(windDirRad);
  return [downwind, crosswind];
}

/**
 * Estimate the source location and release rate from measurement points.
 *
 * Uses brute-force grid search: for each candidate cell, compute the
 * Gaussian Plume concentration with Q=1 at each measurement point,
 * then solve for Q analytically via least-squares in log-space.
 *
 * @param points       Measurement points with concentration values
 * @param windDirRad   Wind "towards" direction in radians (math convention)
 * @param params       Search and plume parameters
 */
export function estimateSource(
  points: DataPoint[],
  windDirRad: number,
  params: SearchParams
): SourceEstimate {
  if (points.length === 0) {
    return { sourceX: 0, sourceY: 0, releaseRate: 0, error: Infinity };
  }

  // Compute search bounds from measurement points
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  // Expand search area upwind to find source before the measurements
  const extent = Math.max(maxX - minX, maxY - minY, 100);
  const buffer = extent * 1.5;
  minX -= buffer;
  maxX += buffer;
  minY -= buffer;
  maxY += buffer;

  const res = params.searchResolution;
  const plumeParams: GaussianPlumeParams = {
    Q: 1,
    windSpeed: params.windSpeed,
    stabilityClass: params.stabilityClass,
    releaseHeight: params.releaseHeight,
  };

  let bestError = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestQ = 0;

  for (let cx = minX; cx <= maxX; cx += res) {
    for (let cy = minY; cy <= maxY; cy += res) {
      // For each candidate source, compute C_i(Q=1) at each measurement
      let sumCM = 0; // sum of C_i * log(M_i)
      let sumCC = 0; // sum of C_i * C_i
      let valid = true;

      const unitConcs: number[] = [];
      for (const p of points) {
        const [downwind, crosswind] = toWindCoords(p.x, p.y, cx, cy, windDirRad);
        const c = gaussianPlume(downwind, crosswind, plumeParams);
        unitConcs.push(c);
        if (c <= 0) {
          valid = false;
          break;
        }
      }

      if (!valid) continue;

      // Solve for Q in log-space: minimize sum((log(Q*C_i) - log(M_i))^2)
      // d/dQ [...] = 0 → log(Q) = mean(log(M_i) - log(C_i))
      let sumLogRatio = 0;
      for (let i = 0; i < points.length; i++) {
        sumLogRatio += Math.log(Math.max(points[i].value, 1e-30)) - Math.log(unitConcs[i]);
      }
      const logQ = sumLogRatio / points.length;
      const Q = Math.exp(logQ);

      if (Q <= 0) continue;

      // Compute log-space error
      let error = 0;
      for (let i = 0; i < points.length; i++) {
        const logPred = Math.log(Q * unitConcs[i]);
        const logObs = Math.log(Math.max(points[i].value, 1e-30));
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
    releaseRate: bestQ,
    error: bestError,
  };
}
```

**Step 2: Run tests to verify they pass**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.ts
git commit -m "feat: add grid search source estimation"
```

---

### Task 7: STE Algorithm Interface — Tests

**Files:**
- Modify: `src/common/interpolation/ste.test.ts`

**Step 1: Add tests for the full algorithm interface**

Append to test file:

```typescript
import { steAlgorithm } from './ste';

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

  it('has all required param descriptors with defaults', () => {
    for (const param of steAlgorithm.params) {
      expect(param.key).toBeTruthy();
      expect(param.label).toBeTruthy();
      expect(param.default).toBeDefined();
      if (param.type === 'number') {
        expect(param.min).toBeDefined();
        expect(param.max).toBeDefined();
      }
    }
  });

  it('prepare + evaluate produces plume-shaped output', () => {
    // Place measurements that suggest a source at origin, wind to east
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

    // Downwind of estimated source should have positive values
    const cDownwind = steAlgorithm.evaluate(150, 0, state);
    expect(cDownwind).toBeGreaterThan(0);

    // Far crosswind should be lower
    const cCrosswind = steAlgorithm.evaluate(150, 200, state);
    expect(cCrosswind).toBeLessThan(cDownwind);
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

    // Far upwind of any reasonable source position
    const cUpwind = steAlgorithm.evaluate(-500, 0, state);
    expect(cUpwind).toBe(0);
  });
});
```

**Step 2: Run tests to verify new tests fail**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: FAIL — `steAlgorithm` not exported

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.test.ts
git commit -m "test: add STE algorithm interface tests"
```

---

### Task 8: STE Algorithm Interface — Implementation

**Files:**
- Modify: `src/common/interpolation/ste.ts`

**Step 1: Implement the algorithm object**

Add to `ste.ts`:

```typescript
interface SteState {
  sourceX: number;
  sourceY: number;
  releaseRate: number;
  windDirRad: number;    // "towards" direction
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
}

/**
 * Convert wind direction from meteorological degrees (where wind comes FROM,
 * 0=N, 90=E, clockwise) to math radians (direction wind blows TOWARDS).
 */
function windFromDegreesToRad(degrees: number): number {
  // Meteorological: 270 = from west → blows towards east
  // Math coords: east = 0 rad
  // "towards" = "from" + 180°
  const towardsDeg = (degrees + 180) % 360;
  // Convert to math convention: 0°=east, counter-clockwise
  // Math angle = 90° - meteo "towards"... simpler:
  // meteo 0=N, 90=E → math 0=E, 90=N
  // towards_rad = (90 - towardsDeg) * PI/180
  return ((90 - towardsDeg) * Math.PI) / 180;
}

export const steAlgorithm: InterpolationAlgorithm<SteState> = {
  id: 'ste',
  label: 'Source Term Estimation',
  description:
    'Quellstärkenabschätzung: Schätzt aus Messwerten den Ursprung und die Stärke einer Emissionsquelle mittels Gaußschem Ausbreitungsmodell (Gauß-Fahne).',
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
      min: 0.5,
      max: 30,
      step: 0.5,
      default: 3,
    },
    {
      key: 'stabilityClass',
      label: 'Stabilitätsklasse (1=A … 6=F)',
      type: 'number',
      min: 1,
      max: 6,
      step: 1,
      default: 4,
    },
    {
      key: 'releaseHeight',
      label: 'Quellhöhe (m)',
      type: 'number',
      min: 0,
      max: 100,
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
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): SteState {
    const windDir = typeof params.windDirection === 'number' ? params.windDirection : 270;
    const windSpeed = typeof params.windSpeed === 'number' ? params.windSpeed : 3;
    const stabilityClass =
      typeof params.stabilityClass === 'number' ? params.stabilityClass : 4;
    const releaseHeight =
      typeof params.releaseHeight === 'number' ? params.releaseHeight : 0;
    const searchResolution =
      typeof params.searchResolution === 'number' ? params.searchResolution : 20;

    const windDirRad = windFromDegreesToRad(windDir);

    const estimate = estimateSource(points, windDirRad, {
      windSpeed,
      stabilityClass,
      releaseHeight,
      searchResolution,
    });

    return {
      sourceX: estimate.sourceX,
      sourceY: estimate.sourceY,
      releaseRate: estimate.releaseRate,
      windDirRad,
      windSpeed,
      stabilityClass,
      releaseHeight,
    };
  },

  evaluate(x: number, y: number, state: SteState): number {
    const dx = x - state.sourceX;
    const dy = y - state.sourceY;
    const downwind =
      dx * Math.cos(state.windDirRad) + dy * Math.sin(state.windDirRad);
    const crosswind =
      -dx * Math.sin(state.windDirRad) + dy * Math.cos(state.windDirRad);

    return gaussianPlume(downwind, crosswind, {
      Q: state.releaseRate,
      windSpeed: state.windSpeed,
      stabilityClass: state.stabilityClass,
      releaseHeight: state.releaseHeight,
    });
  },
};
```

**Step 2: Run tests to verify they pass**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/ste.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/ste.ts
git commit -m "feat: add STE algorithm implementing InterpolationAlgorithm interface"
```

---

### Task 9: Register Algorithm in Barrel Index

**Files:**
- Modify: `src/common/interpolation/index.ts`

**Step 1: Add export and registration**

Add to `src/common/interpolation/index.ts`:

1. Add to the re-export block:
   ```typescript
   export { steAlgorithm } from './ste';
   ```

2. Add to the registration block at the bottom:
   ```typescript
   import { steAlgorithm } from './ste';
   registerAlgorithm(steAlgorithm);
   ```

**Step 2: Run all interpolation tests**

Run: `cd .worktrees/feature/ste && npx vitest run src/common/interpolation/`
Expected: All tests across all algorithm test files PASS

**Step 3: Commit**

```bash
cd .worktrees/feature/ste
git add src/common/interpolation/index.ts
git commit -m "feat: register STE algorithm in interpolation barrel index"
```

---

### Task 10: Build Verification

**Step 1: Run the full test suite**

Run: `cd .worktrees/feature/ste && npm run test`
Expected: All tests PASS

**Step 2: Run lint**

Run: `cd .worktrees/feature/ste && npm run lint`
Expected: No errors

**Step 3: Run build**

Run: `cd .worktrees/feature/ste && npm run build`
Expected: Build succeeds

**Step 4: Commit any fixes if needed, otherwise done**
