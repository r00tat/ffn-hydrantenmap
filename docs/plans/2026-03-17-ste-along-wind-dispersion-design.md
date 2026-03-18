# STE Along-Wind Dispersion (sigma_x)

## Problem

The Gaussian plume model in `ste.ts` has a hard cutoff at `downwind <= 0` returning exactly 0 concentration. This is physically incorrect — near the source, pressure-driven and turbulent diffusion causes spread in all directions, including upwind. At low wind speeds (1 m/s), this effect is significant.

This causes `estimateSource()` to reject any candidate source position where even one measurement point is upwind (lines 240-246), forcing the source far away from the actual emission cluster when measurements are scattered around the source.

## Solution: Along-Wind Gaussian Decay

Add a sigma_x (along-wind dispersion) component that creates quasi-isotropic dispersion near the source, transitioning smoothly to the classical wind-dominated plume further away.

### Modified `gaussianPlume()` behavior

For **downwind > 0** (classical case): No change. Standard Gaussian plume formula.

For **downwind <= 0** (upwind): Instead of returning 0, compute concentration using:
- Total distance from source: `dist = sqrt(downwind^2 + crosswind^2)`
- `d_eff = max(1, dist)` as reference distance for dispersion coefficients
- sigma_x computed from the same Pasquill-Gifford parameterization as sigma_y: `sigma_x = pasquillSigmaY(d_eff, stabilityClass)`
- Along-wind factor: `exp(-downwind^2 / (2 * sigma_x^2))`
- sigma_y and sigma_z computed at `d_eff` instead of downwind distance

The full formula for upwind points:
```
C = Q / (2*PI*u*sigma_y(d_eff)*sigma_z(d_eff)) * exp(-cw^2/(2*sigma_y^2)) * exp(-H^2/(2*sigma_z^2)) * exp(-dw^2/(2*sigma_x^2))
```

### Expected behavior

| Wind speed | 10m upwind | 50m upwind | 100m+ upwind |
|-----------|-----------|-----------|-------------|
| 1 m/s | ~60-80% of 10m downwind | ~10-20% | near 0 |
| 5 m/s | ~30-50% | ~5% | near 0 |

### Changes

1. **`gaussianPlume()`** — Replace `if (downwind <= 0) return 0` with along-wind Gaussian decay using distance-based sigma computation
2. **`estimateSource()`** — Remove `valid = false` on `c <= 0` (no longer needed since upwind points get positive concentrations)
3. **Tests** — Update existing upwind-zero assertions to expect small positive values; add tests for upwind decay and near-source isotropy

### What does NOT change
- Downwind plume shape (identical values for all downwind > 0 cases)
- `peakPoint`, `colorScaleValues`, correction logic
- All existing downwind-only test scenarios (same values)
