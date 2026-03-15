# Spline Interpolation Algorithm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Thin-Plate Spline (TPS) as a second spatial interpolation algorithm alongside IDW, selectable per layer in the heatmap settings.

**Architecture:** Add `solveTPS()` and `evaluateTPS()` to `src/common/interpolation.ts`, pass an `algorithm` discriminator into `buildInterpolationGrid()`, update `InterpolationOverlay.tsx` to solve TPS weights once per data change, and add an algorithm `ToggleButtonGroup` in `HeatmapSettings.tsx`. The IDW Exponent slider shows only when IDW is selected.

**Tech Stack:** TypeScript, React, MUI ToggleButtonGroup, existing KDBush spatial index. No new dependencies.

---

## Background

The existing IDW algorithm is a weighted average — it can never produce a value outside `[min, max]` of the input data. Thin-Plate Spline fits a smooth surface *through* the exact input values and can extrapolate beyond the measured range, which is required for use cases like radiation monitoring.

### TPS math primer

Given `n` scattered points `(x_i, y_i, v_i)`:

1. Build an `(n+3) × (n+3)` system:
   - Top-left `n×n` block: `K[i][j] = φ(||p_i - p_j||)` where `φ(r) = r² ln(r)` (0 when r=0)
   - Top-right `n×3` block: `[1, x_i, y_i]` for each row i
   - Bottom-left `3×n`: transpose of above
   - Bottom-right `3×3`: zeros
   - Right-hand side: `[v_0 … v_{n-1}, 0, 0, 0]`
2. Solve the system → weights `w[0..n-1]` and polynomial coefficients `a[0..2]`
3. Evaluate at any `(x, y)`: `a[0] + a[1]·x + a[2]·y + Σ w[i]·φ(dist(p_i, (x,y)))`

The solver uses Gaussian elimination with partial pivoting (no external library needed for n ≤ 300).

---

## Task 1: Add `interpolationAlgorithm` to `HeatmapConfig`

**Files:**
- Modify: `src/components/firebase/firestore.ts`

**Step 1: Add the field**

In the `HeatmapConfig` interface (after `interpolationOpacity`), add:

```ts
/** Interpolation algorithm: 'idw' (default) or 'spline' (Thin-Plate Spline) */
interpolationAlgorithm?: 'idw' | 'spline';
```

**Step 2: Verify TypeScript compiles**

```bash
cd .worktrees/feature/spline-interpolation
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (pre-existing errors are unrelated to this change).

**Step 3: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add interpolationAlgorithm field to HeatmapConfig"
```

---

## Task 2: Implement TPS solver and evaluator in `interpolation.ts`

**Files:**
- Modify: `src/common/interpolation.ts`

**Step 1: Add TPS types and helper at end of the IDW section (before the Color LUT section)**

Insert after `idwInterpolateIndexed` (before the `// ---------------------------------------------------------------------------` Color LUT comment):

```ts
// ---------------------------------------------------------------------------
// Thin-Plate Spline (TPS) Interpolation
// ---------------------------------------------------------------------------

export interface TpsWeights {
  /** Solved weights w_i for each input point */
  w: Float64Array;
  /** Polynomial coefficients [a0, a1, a2] */
  a: Float64Array;
  /** Input points snapshot used to solve (same reference as DataPoint[]) */
  points: DataPoint[];
}

/**
 * TPS radial basis function: φ(r) = r² ln(r), with φ(0) = 0.
 */
function tpsPhi(r: number): number {
  if (r < 1e-10) return 0;
  return r * r * Math.log(r);
}

/**
 * Solve the Thin-Plate Spline system for the given data points.
 * Returns weights and polynomial coefficients.
 *
 * Uses Gaussian elimination with partial pivoting.
 * Suitable for n ≤ 300 points (O(n²) memory, O(n³) time — done once per render).
 */
export function solveTPS(points: DataPoint[]): TpsWeights {
  const n = points.length;
  const size = n + 3;

  // Build matrix A (row-major, flattened) and RHS vector b
  const A = new Float64Array(size * size);
  const b = new Float64Array(size);

  // Top-left n×n block: K[i][j] = φ(||p_i - p_j||)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const r = Math.sqrt(dx * dx + dy * dy);
      A[i * size + j] = tpsPhi(r);
    }
  }

  // Top-right n×3 and bottom-left 3×n blocks: [1, x, y]
  for (let i = 0; i < n; i++) {
    A[i * size + n] = 1;
    A[i * size + n + 1] = points[i].x;
    A[i * size + n + 2] = points[i].y;
    A[n * size + i] = 1;
    A[(n + 1) * size + i] = points[i].x;
    A[(n + 2) * size + i] = points[i].y;
  }
  // Bottom-right 3×3 block: already zero (Float64Array is zero-initialised)

  // RHS: data values, then three zeros
  for (let i = 0; i < n; i++) {
    b[i] = points[i].value;
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < size; col++) {
    // Find pivot
    let maxVal = Math.abs(A[col * size + col]);
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      const v = Math.abs(A[row * size + col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }
    // Swap rows
    if (maxRow !== col) {
      for (let k = 0; k < size; k++) {
        const tmp = A[col * size + k];
        A[col * size + k] = A[maxRow * size + k];
        A[maxRow * size + k] = tmp;
      }
      const tmp = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmp;
    }
    // Eliminate below
    const pivot = A[col * size + col];
    if (Math.abs(pivot) < 1e-14) continue; // singular/near-singular row
    for (let row = col + 1; row < size; row++) {
      const factor = A[row * size + col] / pivot;
      for (let k = col; k < size; k++) {
        A[row * size + k] -= factor * A[col * size + k];
      }
      b[row] -= factor * b[col];
    }
  }

  // Back-substitution
  const x = new Float64Array(size);
  for (let row = size - 1; row >= 0; row--) {
    let sum = b[row];
    for (let col = row + 1; col < size; col++) {
      sum -= A[row * size + col] * x[col];
    }
    const diag = A[row * size + row];
    x[row] = Math.abs(diag) < 1e-14 ? 0 : sum / diag;
  }

  return {
    w: x.slice(0, n),
    a: x.slice(n, n + 3),
    points,
  };
}

/**
 * Evaluate a solved TPS at point (x, y).
 */
export function evaluateTPS(x: number, y: number, tps: TpsWeights): number {
  let value = tps.a[0] + tps.a[1] * x + tps.a[2] * y;
  const pts = tps.points;
  for (let i = 0; i < pts.length; i++) {
    const dx = x - pts[i].x;
    const dy = y - pts[i].y;
    const r = Math.sqrt(dx * dx + dy * dy);
    value += tps.w[i] * tpsPhi(r);
  }
  return value;
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

**Step 3: Commit**

```bash
git add src/common/interpolation.ts
git commit -m "feat: implement Thin-Plate Spline solver and evaluator"
```

---

## Task 3: Update `buildInterpolationGrid` to support both algorithms

**Files:**
- Modify: `src/common/interpolation.ts`

**Step 1: Add `algorithm` and `tpsWeights` params to the function signature**

Find the `params` object type in `buildInterpolationGrid` and add two new fields:

```ts
  /** Interpolation algorithm (default: 'idw') */
  algorithm?: 'idw' | 'spline';
  /** Pre-solved TPS weights — required when algorithm === 'spline' */
  tpsWeights?: TpsWeights;
```

**Step 2: Destructure the new params**

In the destructuring at the top of `buildInterpolationGrid`, add:

```ts
  algorithm = 'idw',
  tpsWeights,
```

**Step 3: Replace the IDW call with a dispatch**

Find this line (near end of the grid loop):

```ts
      // Compute IDW value — color is purely from interpolation, no value fade.
      const value = idwInterpolateIndexed(cx, cy, points, power, spatialIndex, searchRadius);
```

Replace with:

```ts
      // Compute interpolated value — IDW or TPS depending on algorithm.
      const value =
        algorithm === 'spline' && tpsWeights
          ? evaluateTPS(cx, cy, tpsWeights)
          : idwInterpolateIndexed(cx, cy, points, power, spatialIndex, searchRadius);
```

**Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

**Step 5: Commit**

```bash
git add src/common/interpolation.ts
git commit -m "feat: dispatch IDW or TPS in buildInterpolationGrid"
```

---

## Task 4: Update `InterpolationOverlay.tsx` to solve TPS and pass it through

**Files:**
- Modify: `src/components/Map/layers/InterpolationOverlay.tsx`

**Step 1: Read the full file**

Read `src/components/Map/layers/InterpolationOverlay.tsx` to understand the current render flow before editing.

**Step 2: Import new symbols**

Add `solveTPS` and `TpsWeights` to the import from `'../../../common/interpolation'`:

```ts
import {
  buildColorLUT,
  buildInterpolationGrid,
  computeConvexHull,
  DataPoint,
  solveTPS,
  TpsWeights,
} from '../../../common/interpolation';
```

**Step 3: Add `tpsWeights` to layer state**

In `initialize(...)`, add a `_tpsWeights` property alongside `_points`:

```ts
    _tpsWeights: TpsWeights | null;
```

and in the body:

```ts
    this._tpsWeights = null;
```

**Step 4: Solve TPS weights when data is set**

Find where `this._points` is assigned (likely in a `setData` or similar method, or in the `redraw`/`_render` function). After assigning `this._points`, add:

```ts
    const algo = this._config.interpolationAlgorithm ?? 'idw';
    this._tpsWeights = algo === 'spline' && this._points.length >= 3
      ? solveTPS(this._points)
      : null;
```

**Step 5: Pass algorithm and weights to `buildInterpolationGrid`**

Find the call to `buildInterpolationGrid(...)` and add the two new params:

```ts
      algorithm: this._config.interpolationAlgorithm ?? 'idw',
      tpsWeights: this._tpsWeights ?? undefined,
```

**Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

**Step 7: Commit**

```bash
git add src/components/Map/layers/InterpolationOverlay.tsx
git commit -m "feat: solve TPS weights in InterpolationOverlay and pass to grid builder"
```

---

## Task 5: Add algorithm selector to `HeatmapSettings.tsx`

**Files:**
- Modify: `src/components/FirecallItems/HeatmapSettings.tsx`

**Step 1: Add the algorithm `ToggleButtonGroup`**

In the interpolation settings block (inside the `else` branch of `visualizationMode === 'heatmap'`), add an algorithm selector *before* the Radius slider and *after* the opening `<>`:

```tsx
              <Box>
                <Typography variant="body2" gutterBottom>
                  Algorithmus
                </Typography>
                <ToggleButtonGroup
                  value={current.interpolationAlgorithm ?? 'idw'}
                  exclusive
                  onChange={(_, val) => val && update({ interpolationAlgorithm: val })}
                  size="small"
                >
                  <ToggleButton value="idw">IDW</ToggleButton>
                  <ToggleButton value="spline">Spline</ToggleButton>
                </ToggleButtonGroup>
              </Box>
```

**Step 2: Conditionally show the IDW Exponent slider**

Find the existing IDW Exponent `<Box>`:

```tsx
              <Box>
                <Typography variant="body2" gutterBottom>
                  IDW Exponent: {current.interpolationPower ?? 2}
                </Typography>
```

Wrap it in a conditional so it only appears for IDW:

```tsx
              {(current.interpolationAlgorithm ?? 'idw') === 'idw' && (
                <Box>
                  <Typography variant="body2" gutterBottom>
                    IDW Exponent: {current.interpolationPower ?? 2}
                  </Typography>
                  <Slider
                    value={current.interpolationPower ?? 2}
                    onChange={(_, val) => update({ interpolationPower: val as number })}
                    min={1}
                    max={5}
                    step={0.5}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                </Box>
              )}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

**Step 4: Verify lint is not worse**

```bash
npm run lint 2>&1 | grep "error"
```

Expected: same 3 pre-existing errors, no new ones.

**Step 5: Commit**

```bash
git add src/components/FirecallItems/HeatmapSettings.tsx
git commit -m "feat: add algorithm selector (IDW/Spline) to heatmap settings UI"
```

---

## Task 6: Manual smoke test

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test IDW (regression)**

1. Open the app, create/open a layer with numeric data schema fields
2. Enable heatmap, switch to "Interpolation" mode
3. Confirm "Algorithmus" toggle shows **IDW | Spline** with IDW selected
4. Confirm IDW Exponent slider is visible
5. Verify interpolation renders as before

**Step 3: Test Spline**

1. Select "Spline" in the Algorithmus toggle
2. Confirm IDW Exponent slider disappears
3. Verify the heatmap renders (no crash, no blank canvas)
4. With a radiation-like dataset (e.g. values 5, 10, 100 at different locations), verify the Spline surface shows values that exceed the max input value in high-density regions (extrapolation)

**Step 4: Test with < 3 points**

Confirm the layer renders without crash when fewer than 3 data points exist (TPS falls back to null, grid builder falls back to IDW).

---

## Task 7: Final cleanup and PR

**Step 1: Reset next-env.d.ts to avoid noise**

```bash
git checkout -- next-env.d.ts
```

**Step 2: Final lint check**

```bash
npm run lint 2>&1 | grep "error"
```

Expected: same 3 pre-existing errors only.

**Step 3: Commit any remaining changes**

```bash
git status
```

If clean, proceed. If there are uncommitted changes, commit them.

**Step 4: Push and open PR**

```bash
GITHUB_TOKEN= gh pr create \
  --title "feat: add Spline (Thin-Plate) interpolation algorithm" \
  --body "Adds TPS as a second spatial interpolation option alongside IDW.

## Changes
- \`HeatmapConfig.interpolationAlgorithm\` field (\`'idw' | 'spline'\`, default \`'idw'\`)
- TPS solver (\`solveTPS\`) and evaluator (\`evaluateTPS\`) in \`src/common/interpolation.ts\`
- \`buildInterpolationGrid\` dispatches IDW or TPS based on algorithm param
- \`InterpolationOverlay\` solves TPS weights once per data change
- Algorithm selector UI in HeatmapSettings (IDW Exponent slider hidden for Spline)

## Why Spline?
IDW is bounded by input \`[min, max]\` — it cannot extrapolate. TPS fits a smooth surface through exact measurement points and can exceed the measured range, which is required for radiation/temperature heatmaps where the highest measured value is not necessarily the peak.

Closes #[issue]"
```
