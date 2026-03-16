# Inverse-Square + Directional Shielding Algorithm

**Branch:** `feature/interpolation`
**Date:** 2026-03-16
**Status:** Implementation complete — pending tests run, registration, and commit

---

## Goal

Add a new spatial interpolation algorithm (`inv-square`) to `src/common/interpolation/` that models **point radiation sources** (or any other inverse-square-law emitter) from a sparse set of field measurements.

The algorithm must:

1. **Locate the source** — find the peak of the TPS (Thin-Plate Spline) surface on a coarse grid search; this is the estimated source location `(sourceX, sourceY)`.
2. **Fit source strength `k`** — closed-form weighted least-squares: `k = Σ(vᵢ/dᵢ²) / Σ(1/dᵢ⁴)` where `dᵢ` is the distance in metres from the estimated source to measurement `i`.
3. **Model directional shielding** — compute per-measurement shielding factor `sᵢ = vᵢ / (k/dᵢ²)` (1 = unshielded, <1 = blocked by an obstacle). Shielding at any grid point is angular-IDW interpolated from these factors, using circular distance `1 − cos(Δθ)` as the metric.
4. **Evaluate the grid** — `I(x,y) = (k / dₘ²) · s(θ)` where `dₘ` is the metric distance (clamped to ≥ 0.5 m) and `s(θ)` is the interpolated shielding at the angle from source to the grid point.
5. **Report value at 1 m** — `valueAt1m(state) = k` (unshielded open-field reference value at 1 m from the source).

### Why this approach

The user does **not** draw walls or obstacles on the map. Shielding is inferred purely from measurement residuals — points that read lower than the physics model predicts must be attenuated by something in that direction. Angular interpolation of these residuals propagates the inferred shielding to all grid points in that directional sector.

---

## Algorithm Design

```
Measurements (x, y, value)
        │
        ▼
 TPS peak search (40×40 grid, ±30% buffer around data extent)
        │
        ▼
 Source location (srcX, srcY)
        │
        ├──► fit k (closed-form LS in metric space)
        │
        ├──► per-measurement:
        │      angle θᵢ = atan2(dy, dx)
        │      shielding sᵢ = vᵢ / (k / dᵢ²)   [clamped to ≥ 0]
        │
        └──► evaluate(x, y):
               dₘ = dist(x,y → src) × mpp  [clamped to ≥ 0.5 m]
               θ  = atan2(y-srcY, x-srcX)
               s  = angular IDW(θ, {θᵢ, sᵢ})
               return (k / dₘ²) · s
```

### Key constants

| Constant | Value | Purpose |
|---|---|---|
| `MIN_DIST_M` | 0.5 m | Clamps singularity near source |
| `ANGULAR_EPS` | 0.02 | Prevents division-by-zero at same angle |
| TPS grid | 40 × 40 steps | Coarse source search resolution |
| TPS buffer | 30% of extent | Search area padding |

### Angular IDW circular distance

```
dAngle(θ, θᵢ) = 1 − cos(θ − θᵢ)  ∈ [0, 2]
weight wᵢ = 1 / (dAngle + ε)
s(θ) = Σ(wᵢ · sᵢ) / Σwᵢ
```

---

## Files

| File | Status | Description |
|---|---|---|
| `src/common/interpolation/invSquare.ts` | ✅ written, untracked | Algorithm implementation |
| `src/common/interpolation/__tests__/invSquare.test.ts` | ✅ written, untracked | Vitest test suite |
| `src/common/interpolation/index.ts` | ⬜ to update | Export + register `invSquareAlgorithm` |

---

## Exported API

```typescript
// Algorithm object (implements InterpolationAlgorithm<InvSquareState>)
export const invSquareAlgorithm: InterpolationAlgorithm<InvSquareState>;

// Convenience: get unshielded value at 1 m (= state.k)
export function valueAt1m(state: InvSquareState): number;

// State shape (accessible for overlays / popups)
export interface InvSquareState {
  sourceX: number;
  sourceY: number;
  k: number;              // value at 1 m, unshielded
  metersPerPixel: number;
  angles: Float64Array;   // angle from source to each measurement
  shielding: Float64Array;// shielding factor per measurement
  fullCanvasRender: boolean;
}
```

`_metersPerPixel` and `_fullCanvasRender` are injected by the overlay via `params`.

---

## Test Coverage

All tests in `src/common/interpolation/__tests__/invSquare.test.ts`:

### Metadata
- `id` is `"inv-square"`
- `label` is non-empty

### Perfect inverse-square (no shielding)
- Recovers `k ≈ 1000` from symmetric ring measurements at 10 m and 20 m
- Locates source near origin `(0, 0)`
- Evaluates close to each measurement value at the measurement location
- Follows inverse-square law between measurement distances (at 15 m)

### Directional shielding
- East (0°) is 50% shielded → east grid value < 75% of west grid value
- West (180°) stays near the physics value `k/d²`
- Far east point is less than near east point (inv-square still dominates distance)

### Edge cases
- Empty point set → evaluate returns 0, `valueAt1m` returns 0
- Single measurement → no throw
- No negative values anywhere on a 7×7 test grid

---

## Remaining Tasks

- [ ] Run tests: `NO_COLOR=1 npm run test src/common/interpolation/__tests__/invSquare.test.ts`
- [ ] Fix any failures
- [ ] Add to `index.ts`: export `invSquareAlgorithm`, `valueAt1m`, `InvSquareState`; `registerAlgorithm(invSquareAlgorithm)`
- [ ] Run full test suite: `NO_COLOR=1 npm run test`
- [ ] Run lint: `npm run lint`
- [ ] Commit: `git add` + `git commit`

---

## Operational Use (Feuerwehr context)

After `prepare()`, display in the sidebar:

- **Estimated source location**: `(sourceX, sourceY)` → show as a special marker on the map
- **Value at 1 m** = `state.k` in the measurement unit (e.g. µSv/h)
- **Shielding summary**: min/max/mean of `state.shielding` — if min < 0.5, there is significant directional attenuation in at least one sector

The grid render shows both the distance falloff and the angular shielding shadow — grid cells in the "shadow" of an obstacle will appear darker even without any explicit wall geometry.