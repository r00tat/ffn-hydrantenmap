# Interpolation Algorithm Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the interpolation system into an extensible registry so new algorithms can be added in a single file with auto-generated UI.

**Architecture:** Strategy pattern with a central registry. Each algorithm implements `InterpolationAlgorithm<TState>` (prepare/evaluate lifecycle). The monolithic `interpolation.ts` is split into `src/common/interpolation/` with separate files for types, utils, registry, grid builder, and each algorithm. HeatmapConfig gains a generic `interpolationParams` record. HeatmapSettings auto-generates controls from each algorithm's param schema.

**Tech Stack:** TypeScript, React, MUI, Vitest, KDBush

---

### Task 1: Create types module

**Files:**
- Create: `src/common/interpolation/types.ts`

**Step 1: Write the types file**

```typescript
import type KDBush from 'kdbush';

export interface Point2D {
  x: number;
  y: number;
}

export interface DataPoint extends Point2D {
  value: number;
}

export interface TpsWeights {
  w: Float64Array;
  a: Float64Array;
  points: DataPoint[];
  shiftX: number;
  shiftY: number;
  scale: number;
  dataMin: number;
}

/**
 * Descriptor for a single algorithm parameter.
 * Used to auto-generate UI controls in HeatmapSettings.
 */
export interface AlgorithmParamDescriptor {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
}

/**
 * The contract every interpolation algorithm must implement.
 *
 * TState is the type returned by prepare() and consumed by evaluate().
 * For algorithms with no precomputation, use a simple struct with points + params.
 */
export interface InterpolationAlgorithm<TState = unknown> {
  /** Unique identifier stored in HeatmapConfig.interpolationAlgorithm */
  id: string;
  /** Display name for the UI */
  label: string;
  /** Optional description shown as tooltip/help text */
  description?: string;
  /** Parameter schema — drives auto-generated UI controls */
  params: AlgorithmParamDescriptor[];

  /**
   * Precomputation phase. Called once when points or params change.
   * Build spatial indices, solve matrices, etc.
   */
  prepare(points: DataPoint[], params: Record<string, number | boolean>): TState;

  /**
   * Per-pixel evaluation. Called for every grid cell.
   * Must be fast — O(k) or better where k = nearby points.
   */
  evaluate(x: number, y: number, state: TState): number;
}

/**
 * Prepared state passed to buildInterpolationGrid.
 * Wraps the algorithm instance and its precomputed state together.
 */
export interface PreparedInterpolation {
  algorithm: InterpolationAlgorithm<unknown>;
  state: unknown;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/common/interpolation/types.ts 2>&1 | head -20`
Expected: No errors (or only unrelated errors from other files)

**Step 3: Commit**

```bash
git add src/common/interpolation/types.ts
git commit -m "feat: add interpolation algorithm types and registry interface"
```

---

### Task 2: Create registry module

**Files:**
- Create: `src/common/interpolation/registry.ts`

**Step 1: Write the failing test**

Create `src/common/interpolation/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAlgorithm,
  getAlgorithm,
  getAlgorithmList,
  resetRegistry,
} from '../registry';
import type { InterpolationAlgorithm, DataPoint } from '../types';

const mockAlgo: InterpolationAlgorithm<null> = {
  id: 'mock',
  label: 'Mock',
  params: [],
  prepare: () => null,
  evaluate: () => 42,
};

describe('interpolation registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('registers and retrieves an algorithm', () => {
    registerAlgorithm(mockAlgo);
    expect(getAlgorithm('mock')).toBe(mockAlgo);
  });

  it('returns undefined for unknown algorithm', () => {
    expect(getAlgorithm('nonexistent')).toBeUndefined();
  });

  it('lists all registered algorithms', () => {
    const algo2: InterpolationAlgorithm<null> = { ...mockAlgo, id: 'mock2', label: 'Mock 2' };
    registerAlgorithm(mockAlgo);
    registerAlgorithm(algo2);
    const list = getAlgorithmList();
    expect(list).toHaveLength(2);
    expect(list.map((a) => a.id)).toEqual(['mock', 'mock2']);
  });

  it('throws on duplicate registration', () => {
    registerAlgorithm(mockAlgo);
    expect(() => registerAlgorithm(mockAlgo)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/common/interpolation/__tests__/registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write the registry**

Create `src/common/interpolation/registry.ts`:

```typescript
import type { InterpolationAlgorithm } from './types';

const registry = new Map<string, InterpolationAlgorithm<any>>();

export function registerAlgorithm<TState>(algo: InterpolationAlgorithm<TState>): void {
  if (registry.has(algo.id)) {
    throw new Error(`Interpolation algorithm '${algo.id}' is already registered`);
  }
  registry.set(algo.id, algo);
}

export function getAlgorithm(id: string): InterpolationAlgorithm<any> | undefined {
  return registry.get(id);
}

export function getAlgorithmList(): InterpolationAlgorithm<any>[] {
  return Array.from(registry.values());
}

/** Reset registry — for testing only. */
export function resetRegistry(): void {
  registry.clear();
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/common/interpolation/__tests__/registry.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/common/interpolation/registry.ts src/common/interpolation/__tests__/registry.test.ts
git commit -m "feat: add interpolation algorithm registry"
```

---

### Task 3: Extract utils module

**Files:**
- Create: `src/common/interpolation/utils.ts`
- Reference: `src/common/interpolation.ts` (lines 23-170 — hull, point-in-polygon, distance, spatial index)

**Step 1: Create utils.ts**

Move these functions from `interpolation.ts` into `utils.ts`, updating imports to use `./types`:
- `cross` (private helper)
- `computeConvexHull`
- `pointInPolygon`
- `distanceToSegment`
- `distanceToPolygonEdge`
- `buildSpatialIndex`

Also move `hexToRgb` (private) and `buildColorLUT` (lines 441-538).

Keep the exact same implementations — no logic changes. Import `DataPoint`, `Point2D` from `./types`. Import `HeatmapConfig` from `../../components/firebase/firestore`.

**Step 2: Verify existing tests still pass**

Run: `npm run test -- --run src/common/interpolation.test.ts`
Expected: All tests PASS (they still import from `./interpolation` which will re-export)

**Step 3: Commit**

```bash
git add src/common/interpolation/utils.ts
git commit -m "refactor: extract spatial utilities into interpolation/utils"
```

---

### Task 4: Extract IDW algorithm

**Files:**
- Create: `src/common/interpolation/idw.ts`
- Test: `src/common/interpolation/__tests__/idw.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { idwAlgorithm } from '../idw';
import type { DataPoint } from '../types';

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
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/common/interpolation/__tests__/idw.test.ts`
Expected: FAIL — module not found

**Step 3: Implement IDW algorithm**

Create `src/common/interpolation/idw.ts`:

```typescript
import KDBush from 'kdbush';
import type { DataPoint, InterpolationAlgorithm } from './types';

interface IdwState {
  points: DataPoint[];
  power: number;
  index: KDBush;
  searchRadius: number;
}

function idwInterpolateFull(
  x: number,
  y: number,
  points: DataPoint[],
  power: number
): number {
  let weightSum = 0;
  let valueSum = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = x - points[i].x;
    const dy = y - points[i].y;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1e-10) return points[i].value;
    const weight = 1 / Math.pow(distSq, power / 2);
    weightSum += weight;
    valueSum += weight * points[i].value;
  }
  return weightSum > 0 ? valueSum / weightSum : 0;
}

export const idwAlgorithm: InterpolationAlgorithm<IdwState> = {
  id: 'idw',
  label: 'IDW',
  description:
    'IDW (Inverse Distance Weighting): Gewichteter Durchschnitt – begrenzt auf den Wertebereich der Messpunkte. Gut für diskrete Messwerte.',
  params: [
    {
      key: 'power',
      label: 'Exponent',
      type: 'number',
      min: 1,
      max: 5,
      step: 0.5,
      default: 2,
    },
  ],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): IdwState {
    const power = (typeof params.power === 'number' ? params.power : 2);
    const index = new KDBush(points.length);
    for (let i = 0; i < points.length; i++) {
      index.add(points[i].x, points[i].y);
    }
    index.finish();
    // searchRadius is set later by the grid builder via a well-known key,
    // but we default to Infinity (full scan) if not provided.
    const searchRadius = typeof params._searchRadius === 'number' ? params._searchRadius : Infinity;
    return { points, power, index, searchRadius };
  },

  evaluate(x: number, y: number, state: IdwState): number {
    const { points, power, index, searchRadius } = state;
    if (searchRadius === Infinity || points.length <= 20) {
      return idwInterpolateFull(x, y, points, power);
    }
    const neighborIds = index.within(x, y, searchRadius);
    if (neighborIds.length === 0) {
      return idwInterpolateFull(x, y, points, power);
    }
    let weightSum = 0;
    let valueSum = 0;
    for (let i = 0; i < neighborIds.length; i++) {
      const pt = points[neighborIds[i]];
      const dx = x - pt.x;
      const dy = y - pt.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 1e-10) return pt.value;
      const weight = 1 / Math.pow(distSq, power / 2);
      weightSum += weight;
      valueSum += weight * pt.value;
    }
    return weightSum > 0 ? valueSum / weightSum : 0;
  },
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/common/interpolation/__tests__/idw.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/common/interpolation/idw.ts src/common/interpolation/__tests__/idw.test.ts
git commit -m "feat: implement IDW as InterpolationAlgorithm"
```

---

### Task 5: Extract TPS algorithm

**Files:**
- Create: `src/common/interpolation/spline.ts`
- Test: `src/common/interpolation/__tests__/spline.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { splineAlgorithm } from '../spline';
import type { DataPoint } from '../types';

describe('Spline (TPS) algorithm', () => {
  const points: DataPoint[] = [
    { x: 0, y: 0, value: 10 },
    { x: 100, y: 0, value: 20 },
    { x: 50, y: 100, value: 30 },
  ];

  it('has correct metadata', () => {
    expect(splineAlgorithm.id).toBe('spline');
    expect(splineAlgorithm.label).toBe('Thin-Plate Spline');
  });

  it('prepare + evaluate returns near-exact values at data points', () => {
    const state = splineAlgorithm.prepare(points, {});
    // With regularization, values may not be exact but should be close
    expect(splineAlgorithm.evaluate(0, 0, state)).toBeCloseTo(10, 0);
    expect(splineAlgorithm.evaluate(100, 0, state)).toBeCloseTo(20, 0);
    expect(splineAlgorithm.evaluate(50, 100, state)).toBeCloseTo(30, 0);
  });

  it('interpolates smoothly between points', () => {
    const state = splineAlgorithm.prepare(points, {});
    const midValue = splineAlgorithm.evaluate(50, 33, state);
    // Should be somewhere in the data range
    expect(midValue).toBeGreaterThanOrEqual(5);
    expect(midValue).toBeLessThanOrEqual(35);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/common/interpolation/__tests__/spline.test.ts`
Expected: FAIL — module not found

**Step 3: Implement TPS algorithm**

Create `src/common/interpolation/spline.ts`. Move `tpsPhi`, `solveTPS`, `evaluateTPS` from `interpolation.ts` (lines 244-432). Wrap them in the `InterpolationAlgorithm` interface:

```typescript
import type { DataPoint, InterpolationAlgorithm, TpsWeights } from './types';

// -- tpsPhi, solveTPS, evaluateTPS copied from interpolation.ts (lines 266-432) --
// (exact same implementations, just moved here)

function tpsPhi(r: number): number { /* ... same ... */ }
export function solveTPS(points: DataPoint[], lambda = 0.1): TpsWeights { /* ... same ... */ }
export function evaluateTPS(x: number, y: number, tps: TpsWeights): number { /* ... same ... */ }

export const splineAlgorithm: InterpolationAlgorithm<TpsWeights> = {
  id: 'spline',
  label: 'Thin-Plate Spline',
  description:
    'Spline (Thin-Plate): Glatte Fläche durch alle Messpunkte – kann Werte außerhalb des gemessenen Bereichs schätzen. Gut für physikalische Felder wie Strahlung oder Temperatur.',
  params: [],

  prepare(points: DataPoint[], params: Record<string, number | boolean>): TpsWeights {
    if (points.length < 3) {
      // TPS needs at least 3 points; return a degenerate state
      // that evaluate() handles gracefully
      return {
        w: new Float64Array(0),
        a: new Float64Array(3),
        points,
        shiftX: 0,
        shiftY: 0,
        scale: 1,
        dataMin: points.length > 0 ? Math.min(...points.map((p) => p.value)) : 0,
      };
    }
    const lambda = typeof params._lambda === 'number' ? params._lambda : undefined;
    return solveTPS(points, lambda);
  },

  evaluate(x: number, y: number, state: TpsWeights): number {
    if (state.w.length === 0) return 0;
    return evaluateTPS(x, y, state);
  },
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- --run src/common/interpolation/__tests__/spline.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/common/interpolation/spline.ts src/common/interpolation/__tests__/spline.test.ts
git commit -m "feat: implement TPS as InterpolationAlgorithm"
```

---

### Task 6: Extract grid builder

**Files:**
- Create: `src/common/interpolation/grid.ts`

**Step 1: Create grid.ts**

Move `buildInterpolationGrid` from `interpolation.ts` (lines 555-761) into `grid.ts`. Refactor the signature to accept the algorithm generically:

Replace the old params:
```typescript
algorithm?: 'idw' | 'spline';
tpsWeights?: TpsWeights;
power: number;
```

With:
```typescript
algorithm: InterpolationAlgorithm<any>;
state: unknown;
```

Replace the algorithm branching (lines 714-727):
```typescript
// OLD:
if (algorithm === 'spline' && tpsWeights) {
  value = evaluateTPS(cx, cy, tpsWeights);
  value = Math.max(localMin, value);
} else {
  value = idwInterpolateIndexed(cx, cy, interpPoints, power, spatialIndex, searchRadius);
  if (localMin !== -Infinity) value = Math.max(localMin, value);
}

// NEW:
value = algorithm.evaluate(cx, cy, state);
if (localMin !== -Infinity) value = Math.max(localMin, value);
```

Note: The log-scale transform, spatial index for boundary checks, convex hull, and color LUT logic remain in the grid builder — they are rendering concerns, not algorithm concerns. The grid builder still does the log-space point transform before calling `algorithm.prepare()` and exp-transforms after `algorithm.evaluate()`.

Actually, refine this: the grid builder should NOT call prepare — it receives the already-prepared state. The caller (InterpolationOverlay) handles prepare. But the grid builder still needs its own spatial index for boundary/proximity checks (this is separate from the algorithm's internal index). Keep `buildSpatialIndex` usage in grid.ts for boundary logic.

Import `buildSpatialIndex`, `computeConvexHull`, `pointInPolygon`, `buildColorLUT` from `./utils`.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`

**Step 3: Commit**

```bash
git add src/common/interpolation/grid.ts
git commit -m "refactor: extract algorithm-agnostic grid builder"
```

---

### Task 7: Create barrel index and wire up registration

**Files:**
- Create: `src/common/interpolation/index.ts`
- Modify: `src/common/interpolation.ts` — replace with re-exports

**Step 1: Create the barrel index**

```typescript
// Re-export public API
export type {
  Point2D,
  DataPoint,
  TpsWeights,
  AlgorithmParamDescriptor,
  InterpolationAlgorithm,
  PreparedInterpolation,
} from './types';
export {
  computeConvexHull,
  pointInPolygon,
  distanceToSegment,
  distanceToPolygonEdge,
  buildSpatialIndex,
  buildColorLUT,
} from './utils';
export { buildInterpolationGrid } from './grid';
export { registerAlgorithm, getAlgorithm, getAlgorithmList } from './registry';
export { idwAlgorithm } from './idw';
export { splineAlgorithm } from './spline';
export { solveTPS, evaluateTPS } from './spline';

// Register built-in algorithms on import
import { registerAlgorithm } from './registry';
import { idwAlgorithm } from './idw';
import { splineAlgorithm } from './spline';

registerAlgorithm(idwAlgorithm);
registerAlgorithm(splineAlgorithm);
```

**Step 2: Replace the old interpolation.ts**

Replace `src/common/interpolation.ts` with a thin re-export shim:

```typescript
/**
 * @deprecated Import from './interpolation/index' instead.
 * This file re-exports everything for backward compatibility.
 */
export {
  type Point2D,
  type DataPoint,
  type TpsWeights,
  type AlgorithmParamDescriptor,
  type InterpolationAlgorithm,
  computeConvexHull,
  pointInPolygon,
  distanceToSegment,
  distanceToPolygonEdge,
  buildSpatialIndex,
  buildColorLUT,
  buildInterpolationGrid,
  registerAlgorithm,
  getAlgorithm,
  getAlgorithmList,
  idwAlgorithm,
  splineAlgorithm,
  solveTPS,
  evaluateTPS,
} from './interpolation/index';
```

**Step 3: Run all existing tests**

Run: `npm run test -- --run`
Expected: All tests PASS — existing imports from `./interpolation` still work

**Step 4: Commit**

```bash
git add src/common/interpolation/index.ts src/common/interpolation.ts
git commit -m "refactor: create barrel index and backward-compat re-exports"
```

---

### Task 8: Update HeatmapConfig type

**Files:**
- Modify: `src/components/firebase/firestore.ts:69-94`

**Step 1: Update the interface**

Change `interpolationAlgorithm` from union to open string, add `interpolationParams`:

```typescript
export interface HeatmapConfig {
  enabled: boolean;
  activeKey: string;
  colorMode: 'auto' | 'manual';
  invertAutoColor?: boolean;
  radius?: number;
  blur?: number;
  min?: number;
  max?: number;
  colorStops?: { value: number; color: string }[];
  visualizationMode?: 'heatmap' | 'interpolation';
  interpolationRadius?: number;
  /** @deprecated Use interpolationParams.power instead. Kept for migration. */
  interpolationPower?: number;
  interpolationOpacity?: number;
  interpolationAlgorithm?: string;
  interpolationLogScale?: boolean;
  /** Algorithm-specific parameters — keys match AlgorithmParamDescriptor.key */
  interpolationParams?: Record<string, number | boolean>;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors (string is a superset of the old union)

**Step 3: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add interpolationParams to HeatmapConfig"
```

---

### Task 9: Update InterpolationOverlay to use registry

**Files:**
- Modify: `src/components/Map/layers/InterpolationOverlay.tsx`

**Step 1: Update imports and _reset method**

Replace:
```typescript
import {
  buildColorLUT,
  buildInterpolationGrid,
  computeConvexHull,
  DataPoint,
  solveTPS,
  TpsWeights,
} from '../../../common/interpolation';
```

With:
```typescript
import {
  buildColorLUT,
  buildInterpolationGrid,
  computeConvexHull,
  DataPoint,
  getAlgorithm,
  idwAlgorithm,
} from '../../../common/interpolation';
```

In the `_reset` method, replace the algorithm-specific branching (lines 127-161) with:

```typescript
const algoId = this._config.interpolationAlgorithm ?? 'idw';
const algo = getAlgorithm(algoId) ?? idwAlgorithm;

const logScale = !!this._config.interpolationLogScale;
const safeLog = (v: number) => Math.log(Math.max(v, 1e-10));
const interpPoints = logScale
  ? pixelPoints.map((p: DataPoint) => ({ x: p.x, y: p.y, value: safeLog(p.value) }))
  : pixelPoints;

// Merge saved params with algorithm defaults
const savedParams = this._config.interpolationParams ?? {};
// Migration: if interpolationPower exists but not in interpolationParams, use it
const mergedParams: Record<string, number | boolean> = {};
for (const desc of algo.params) {
  mergedParams[desc.key] = savedParams[desc.key] ?? desc.default;
}
if (algo.id === 'idw' && mergedParams.power === undefined && this._config.interpolationPower != null) {
  mergedParams.power = this._config.interpolationPower;
}
// Pass search radius hint for IDW optimization
mergedParams._searchRadius = bufferPx * 5;
// Pass lambda hint for TPS log-scale mode
if (logScale) mergedParams._lambda = 0;

const preparedState = interpPoints.length >= (algo.id === 'spline' ? 3 : 1)
  ? algo.prepare(interpPoints, mergedParams)
  : null;

const hull = computeConvexHull(pixelPoints);

const { imageData, valueGrid, gridCols } = buildInterpolationGrid({
  canvasWidth: canvasW,
  canvasHeight: canvasH,
  points: pixelPoints,
  hull,
  bufferPx,
  opacity: this.options.opacity,
  colorLUT: this._colorLUT,
  config: this._config,
  allValues: this._allValues,
  blockSize,
  algorithm: algo,
  state: preparedState,
});
```

Remove `TpsWeights` and `solveTPS` imports — they're now internal to the spline algorithm.

Remove the `power` option from `InterpolationCanvasLayer.options` (it's now in interpolationParams).

Also update the `initialize` method to remove `_tpsWeights` field (no longer needed).

**Step 2: Run tests**

Run: `npm run test -- --run`
Expected: All tests PASS

**Step 3: Verify dev server works**

Run: `npm run build` (or at minimum `npx tsc --noEmit`)

**Step 4: Commit**

```bash
git add src/components/Map/layers/InterpolationOverlay.tsx
git commit -m "refactor: use algorithm registry in InterpolationOverlay"
```

---

### Task 10: Update HeatmapSettings to auto-generate algorithm UI

**Files:**
- Modify: `src/components/FirecallItems/HeatmapSettings.tsx`

**Step 1: Update imports**

Add:
```typescript
import { getAlgorithmList, getAlgorithm } from '../../common/interpolation';
```

**Step 2: Replace algorithm selector and parameter controls**

Replace the hardcoded algorithm toggle and IDW exponent slider (lines 265-325) with dynamic rendering:

```tsx
<Box>
  <Typography variant="body2" gutterBottom>
    Algorithmus
  </Typography>
  <ToggleButtonGroup
    value={current.interpolationAlgorithm ?? 'idw'}
    exclusive
    onChange={(_, val) => val && update({ interpolationAlgorithm: val, interpolationParams: {} })}
    size="small"
  >
    {getAlgorithmList().map((algo) => (
      <ToggleButton key={algo.id} value={algo.id}>
        {algo.label}
      </ToggleButton>
    ))}
  </ToggleButtonGroup>
  {(() => {
    const algo = getAlgorithm(current.interpolationAlgorithm ?? 'idw');
    if (!algo) return null;
    return (
      <>
        {algo.description && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {algo.description}
          </Typography>
        )}
        {algo.params.map((param) => {
          const savedParams = current.interpolationParams ?? {};
          // Migration: check legacy interpolationPower
          const legacyValue = param.key === 'power' ? current.interpolationPower : undefined;
          const value = savedParams[param.key] ?? legacyValue ?? param.default;

          if (param.type === 'boolean') {
            return (
              <FormControlLabel
                key={param.key}
                control={
                  <Switch
                    checked={!!value}
                    onChange={(e) =>
                      update({
                        interpolationParams: { ...savedParams, [param.key]: e.target.checked },
                      })
                    }
                  />
                }
                label={param.label}
              />
            );
          }

          // number type → Slider
          return (
            <Box key={param.key}>
              <Typography variant="body2" gutterBottom>
                {param.label}: {value as number}
              </Typography>
              <Slider
                value={value as number}
                onChange={(_, val) =>
                  update({
                    interpolationParams: { ...savedParams, [param.key]: val as number },
                  })
                }
                min={param.min ?? 0}
                max={param.max ?? 10}
                step={param.step ?? 1}
                size="small"
                valueLabelDisplay="auto"
              />
            </Box>
          );
        })}
      </>
    );
  })()}
</Box>
```

Remove the old hardcoded IDW exponent slider block (lines 310-325). Keep the shared controls (log scale, radius, opacity) as-is.

**Step 3: Verify it compiles and renders**

Run: `npx tsc --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add src/components/FirecallItems/HeatmapSettings.tsx
git commit -m "feat: auto-generate algorithm parameter UI from registry schema"
```

---

### Task 11: Update grid builder signature

**Files:**
- Modify: `src/common/interpolation/grid.ts`

**Step 1: Update buildInterpolationGrid params**

Change the params interface from:
```typescript
power: number;
algorithm?: 'idw' | 'spline';
tpsWeights?: TpsWeights;
```

To:
```typescript
algorithm: InterpolationAlgorithm<any>;
state: unknown;
```

Update the destructuring and the interpolation branching to use `algorithm.evaluate(cx, cy, state)`.

Keep all boundary/proximity logic unchanged — it's rendering infrastructure, not algorithm logic.

**Step 2: Ensure old interpolation.test.ts still passes**

Run: `npm run test -- --run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/common/interpolation/grid.ts
git commit -m "refactor: make buildInterpolationGrid algorithm-agnostic"
```

---

### Task 12: Clean up old interpolation.ts and update remaining consumers

**Files:**
- Modify: `src/common/interpolation.ts` — remove dead code, keep only re-exports
- Modify: `src/components/Map/layers/HeatmapOverlayLayer.tsx` — update import of `idwInterpolate`

**Step 1: Update HeatmapOverlayLayer.tsx**

The click handler (line 154) uses `idwInterpolate` directly. Update the import:

```typescript
import { idwInterpolate, DataPoint } from '../../../common/interpolation';
```

This still works because the barrel re-exports it. But we should also export the standalone `idwInterpolate` function from `idw.ts` for this use case. Add it to the exports in `idw.ts` and the barrel.

Actually — `idwInterpolate` is currently the full-scan version used for click handlers. It's an internal function of the IDW algorithm now. Export it as a named utility:

In `src/common/interpolation/idw.ts`, make `idwInterpolateFull` a named export renamed to `idwInterpolate`:
```typescript
export function idwInterpolate(...) { /* same */ }
```

Add to barrel: `export { idwInterpolate } from './idw';`

**Step 2: Verify the old test still passes**

Run: `npm run test -- --run src/common/interpolation.test.ts`
Expected: All tests PASS

**Step 3: Remove dead code from old interpolation.ts**

Ensure `src/common/interpolation.ts` is just the re-export shim — no function bodies remain.

**Step 4: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/common/interpolation.ts src/common/interpolation/idw.ts src/common/interpolation/index.ts src/components/Map/layers/HeatmapOverlayLayer.tsx
git commit -m "refactor: clean up old interpolation.ts, update remaining consumers"
```

---

### Task 13: Final verification — build and test

**Step 1: Run full test suite**

Run: `npm run test -- --run`
Expected: All tests PASS

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors

**Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit any remaining fixes**

If any fixes were needed, commit them.
