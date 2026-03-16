# Source Term Estimation (STE) Algorithm Design

## Overview

Add a Source Term Estimation algorithm to the interpolation system. Given scattered measurement points (dose rate / concentration readings), the algorithm estimates the location and strength of a single emission source using a Gaussian Plume dispersion model, then generates a concentration field across the map.

Primary use case: CBRN incidents where firefighters place measurement points with radiation/concentration readings and need to identify the source location and visualize the plume.

## Approach

### Inverse Problem via Grid Search

1. **Grid search** over candidate source locations within the data extent
2. At each candidate, **analytically solve** for release rate Q via least-squares fit of the Gaussian Plume equation against all measurement points
3. **Score** each candidate by residual error (sum of squared log-ratios between predicted and observed values)
4. The candidate with the lowest error is the estimated source (x, y, Q)

This approach is robust (no local minima), integrates naturally with the existing grid infrastructure, and performs well for typical map extents.

### Gaussian Plume Model

Standard steady-state formula:

```
C(x,y) = Q / (2pi * u * sigma_y * sigma_z) * exp(-y^2 / (2 * sigma_y^2)) * exp(-H^2 / (2 * sigma_z^2))
```

Where:
- Q = source release rate (to be estimated)
- u = wind speed (user parameter)
- sigma_y, sigma_z = Pasquill-Gifford dispersion coefficients (function of downwind distance and stability class)
- H = effective release height (user parameter)

Coordinate system is rotated so x-axis aligns with wind direction (downwind).

### Pasquill-Gifford Dispersion Coefficients

Stability classes A (very unstable) through F (very stable). Coefficients parameterized as power-law functions of downwind distance x:

```
sigma_y = a * x^b
sigma_z = c * x^d
```

With published coefficients for each stability class (Turner 1970 / Gifford 1976).

## Algorithm Interface

```typescript
const steAlgorithm: InterpolationAlgorithm<SteState> = {
  id: 'ste',
  label: 'Source Term Estimation',
  description: 'Quellstärkenabschätzung: Schätzt aus Messwerten den Ursprung und die Stärke einer Emissionsquelle mittels Gaußschem Ausbreitungsmodell (Gauß-Fahne).',
  params: [...],
  prepare(points, params) { ... },
  evaluate(x, y, state) { ... },
}
```

### Parameters (auto-generated UI)

| Key | Label | Type | Default | Min | Max | Step | Purpose |
|-----|-------|------|---------|-----|-----|------|---------|
| windDirection | Windrichtung (deg) | number | 270 | 0 | 360 | 5 | Wind origin direction in degrees |
| windSpeed | Windgeschwindigkeit (m/s) | number | 3 | 0.5 | 30 | 0.5 | Wind speed |
| stabilityClass | Stabilitaetsklasse (1=A..6=F) | number | 4 | 1 | 6 | 1 | Pasquill stability class |
| releaseHeight | Quellhoehe (m) | number | 0 | 0 | 100 | 1 | Release height above ground |
| searchResolution | Suchraster (m) | number | 20 | 5 | 50 | 5 | Grid search step size |

### State (precomputed in `prepare`)

```typescript
interface SteState {
  sourceX: number;       // Estimated source position (pixel coords)
  sourceY: number;
  releaseRate: number;   // Estimated Q
  windDirRad: number;    // Wind direction in radians (toward)
  windSpeed: number;
  stabilityClass: number;
  releaseHeight: number;
  points: DataPoint[];
}
```

### `prepare()` — Source Estimation

1. Compute bounding box of measurement points, expand by buffer
2. For each grid cell (at searchResolution spacing):
   - Treat cell as candidate source
   - For each measurement point, compute expected concentration C_i(Q=1) using Gaussian Plume (with Q=1)
   - Solve for Q via least-squares: Q = sum(C_i * M_i) / sum(C_i^2) where M_i are measured values
   - Compute error: sum((log(Q * C_i) - log(M_i))^2) (log-space for better fit across orders of magnitude)
3. Return the candidate with minimum error as the estimated source

### `evaluate(x, y)` — Concentration at Point

1. Transform (x, y) into wind-aligned coordinates relative to estimated source
2. Compute downwind distance and crosswind distance
3. If upwind (downwind < 0), return 0 or near-zero
4. Compute sigma_y, sigma_z from Pasquill-Gifford coefficients
5. Return concentration using Gaussian Plume formula with estimated Q

## Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/common/interpolation/ste.ts` | Algorithm + Gaussian Plume math |
| Create | `src/common/interpolation/ste.test.ts` | Unit tests |
| Modify | `src/common/interpolation/index.ts` | Register steAlgorithm |

No UI changes needed — the algorithm registry and auto-generated parameter UI handle everything automatically.

## Future Extensions

- Multi-source estimation (iterative subtraction or joint optimization)
- Gaussian Puff model for instantaneous releases
- Source marker overlay showing estimated position with confidence indicator
- Time-varying wind / puff tracking