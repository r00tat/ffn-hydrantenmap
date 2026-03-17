# Design: Ausbreitungsprognose (Gaussian Puff Algorithm)

**Date:** 2026-03-17
**Status:** Approved

## Problem Statement

The existing **STE (Source Term Estimation)** algorithm estimates a source location and renders a steady-state Gaussian plume — a continuous-release model that shows the current concentration field. For CBRN incidents, responders also need to project *where the cloud will be* at a future time, accounting for the transient nature of an instantaneous or short-duration release traveling downwind.

A **Gaussian Puff** model addresses this: it treats the release as a traveling cloud blob, not a continuous stream. The new algorithm fits this puff model to the existing measurement points and renders the predicted cloud position at a configurable time horizon.

## Physics Model

### Gaussian Puff Formula

For a puff released at t = 0 from source (srcX, srcY, H), ground-level concentration at time `t_elapsed` is:

```
C(x_dw, y_cw, t) =
  Q / ((2π)^(3/2) · σx(d) · σy(d) · σz(d))
  · exp(-(x_dw - d)² / (2·σx(d)²))   -- downwind: distance from puff center
  · exp(-y_cw²       / (2·σy(d)²))   -- crosswind spread
  · 2·exp(-H²        / (2·σz(d)²))   -- vertical with ground reflection
```

Where:

- `d = u · t_elapsed` — puff center has traveled `d` meters downwind
- `x_dw`, `y_cw` — query point in wind-aligned coordinates relative to source
- `σy(d)`, `σz(d)` — Pasquill-Gifford lateral/vertical dispersion at distance `d` (reused from `ste.ts`)
- `σx(d) ≈ σy(d)` — along-wind spread approximated as equal to lateral spread (standard simplification)
- `H` — release height (m)
- `Q` — total released mass (fitted from measurements)
- `t_elapsed = timeSinceRelease + predictionOffset` (both in seconds)

### Dry Deposition (optional)

When a deposition time constant `τ_dep > 0` is configured, the concentration is multiplied by an exponential decay term to model atmospheric removal:

```
C_final = C_puff · exp(-t_elapsed / τ_dep)
```

`τ_dep = 0` disables deposition (default).

### Key difference from STE (steady-state plume)

| | STE (Gaussian Plume) | Ausbreitungsprognose (Gaussian Puff) |
|---|---|---|
| Release type | Continuous (rate Q in kg/s) | Instantaneous/finite (mass Q in kg) |
| Cloud shape | Infinite downwind cone | Finite traveling blob |
| Time dimension | Steady state | Snapshot at time T |
| Use case | Ongoing leak with stable source | Single puff / short burst |

## Source and Q Estimation

A **grid search** identical in structure to STE's `estimateSource()` is performed over candidate source positions within the measurement bounding box (with 1.5× buffer):

1. For each grid candidate `(cx, cy)`, transform all measurement points to wind-aligned coordinates relative to `(cx, cy)`
2. Compute unit-Q puff concentration at each point using `gaussianPuff()` at `t_elapsed`
3. Estimate Q via log-space least-squares on positive measurements
4. Compute log-MSE error
5. Keep best `(cx, cy, Q)` triple

The search uses the same `searchResolution` parameter and bounding box expansion as STE.

## Algorithm Parameters

| Key | Label (DE) | Type | Range | Default |
|-----|-----------|------|-------|---------|
| `windDirection` | Windrichtung (°, woher) | number | 0–360 | 270 |
| `windSpeed` | Windgeschwindigkeit (m/s) | number | 0–30 | 3 |
| `stabilityClass` | Stabilitätsklasse | select (A–F) | 1–6 | 4 (D) |
| `releaseHeight` | Quellhöhe (m) | number | 1–100 | 1 |
| `timeSinceRelease` | Zeit seit Freisetzung (min) | number | 0–240 | 30 |
| `predictionOffset` | Prognose-Horizont (min) | number | 0–120 | 0 |
| `depositionTimeConstant` | Ablagerungszeitkonstante (min, 0=keine) | number | 0–120 | 0 |
| `searchResolution` | Suchraster (m) | number | 5–50 | 20 |
| `fullCanvasRender` | Gesamte Karte rendern | boolean | — | false |

`t_elapsed = (timeSinceRelease + predictionOffset) × 60` seconds.

## Algorithm Identity

- `id: 'puff'`
- `label: 'Ausbreitungsprognose'`
- `description: 'Prognostiziert die Position und Konzentration einer Schadstoffwolke (Gauß-Puff-Modell) zu einem wählbaren Zeitpunkt. Schätzt Quellort und freigesetzte Masse aus Messwerten und berechnet die Ausbreitung unter Berücksichtigung von Wind, Stabilitätsklasse und atmosphärischer Ablagerung.'`

## File Structure

```
src/common/interpolation/
  puff.ts           NEW — gaussianPuff(), estimatePuffSource(), puffAlgorithm
  puff.test.ts      NEW — unit tests (TDD: written first)
  ste.ts            MODIFY — export pasquillSigmaY, pasquillSigmaZ, windFromDegreesToRad
  index.ts          MODIFY — import and register puffAlgorithm
```

## Integration

The new algorithm integrates seamlessly via the existing `InterpolationAlgorithm<TState>` interface and the algorithm registry. No changes to `InterpolationOverlay`, `HeatmapSettings`, or any other UI component are needed — the UI auto-generates controls from the `params` descriptor array.

## Testing Strategy (TDD)

Tests are written **before** implementation code. Cover:

1. `gaussianPuff()` — positive on centerline, zero upwind, decreasing with distance, deposition decay
2. `estimatePuffSource()` — recovers source from synthetic measurements at known t_elapsed
3. `puffAlgorithm.prepare() + evaluate()` — plume shape, fullCanvasRender flag
4. Edge cases: single point, Q = 0, t_elapsed = 0

Minimum 2 measurement points required (`minPoints: 2`).
