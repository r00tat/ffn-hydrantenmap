# Design: Spline (Thin-Plate) Interpolation Algorithm

**Date:** 2026-03-15
**Status:** Approved

## Summary

Add Thin-Plate Spline (TPS) as a second spatial interpolation algorithm alongside the existing IDW (Inverse Distance Weighting). The user selects the algorithm per layer in the heatmap settings. TPS is the correct choice for smooth physical fields (radiation, temperature, air quality) because it can extrapolate beyond the measured value range — IDW cannot.

## Problem

IDW is a weighted average and is therefore bounded by `[min, max]` of the input data. For a radiation use case where readings might be 5, 10, and 100 µSv/h, IDW will never estimate above 100. Thin-Plate Spline fits a physically motivated smooth surface through exact data points and *can* produce extrapolated values where the gradient warrants it.

## Algorithm: Thin-Plate Spline

TPS minimises bending energy ∫∫(∂²f/∂x² + ∂²f/∂y²)² dA. Given n scattered data points:

1. **Setup (O(n²)):** Assemble and solve an (n+3) × (n+3) linear system to find weights `w_i` and polynomial coefficients `a, b, c`.
2. **Evaluate (O(n) per grid point):** For each grid point `(x, y)` sum: `a + b·x + c·y + Σ w_i · φ(r_i)` where `φ(r) = r² · ln(r)` and `r_i` is the distance to input point `i`.

Linear system is solved once per render (data change), then the weights are reused for every grid cell — keeping render performance acceptable for n ≤ 300 points.

## Design Decisions

- **No external library** — implement TPS from scratch in `src/common/interpolation.ts`. The math is ~50 lines; no dependency justified.
- **No user-facing parameters** — TPS has no intuitive tuning knob. The IDW "Exponent" slider remains IDW-only.
- **Shared grid builder** — `buildInterpolationGrid` gains an `algorithm` parameter (`'idw' | 'spline'`). A pre-computed `tpsWeights` object is passed in for spline mode.
- **Algorithm selector in UI** — shown only when `visualizationMode === 'interpolation'`. A `ToggleButtonGroup` with "IDW" and "Spline" options. IDW exponent slider is conditionally shown only for IDW.

## Data Model Changes

`HeatmapConfig` in `firestore.ts`:
```ts
interpolationAlgorithm?: 'idw' | 'spline';  // default: 'idw'
```

No migration needed — absence of the field defaults to IDW, preserving existing behaviour.

## Files to Change

| File | Change |
|---|---|
| `src/components/firebase/firestore.ts` | Add `interpolationAlgorithm` to `HeatmapConfig` |
| `src/common/interpolation.ts` | Add `solveTPS()`, `evaluateTPS()`, update `buildInterpolationGrid()` |
| `src/components/Map/layers/InterpolationOverlay.tsx` | Pass algorithm to grid builder, solve TPS weights before render |
| `src/components/FirecallItems/HeatmapSettings.tsx` | Add algorithm selector, conditionally show IDW exponent slider |

## UI

In the interpolation settings section (already shown when `visualizationMode === 'interpolation'`):

```
Algorithmus
[ IDW ]  [ Spline ]

(if IDW selected)
IDW Exponent: 2  [slider]

Radius: 30m  [slider]
Deckkraft: 60%  [slider]
```

Labels use German to match existing UI: "IDW" and "Spline" are international terms, no translation needed.
