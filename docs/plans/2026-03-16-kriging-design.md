# Ordinary Kriging Interpolation Algorithm

## Summary

Add Ordinary Kriging as a third interpolation algorithm, implementing the
`InterpolationAlgorithm<KrigingState>` interface. Kriging is a geostatistical
method that fits a variogram (spatial correlation model) from the data and uses
it to compute optimal prediction weights — providing the "best linear unbiased
prediction" (BLUP).

## Approach

**Automatic variogram fitting** — `prepare()` estimates an empirical variogram
from point pairs, then auto-fits a model. Users can select the variogram model
type and adjust the nugget (measurement noise) via auto-generated UI controls.

## Variogram Fitting (in `prepare()`)

1. Compute all pairwise distances and semivariances: γ(h) = ½ E[(Z(x) - Z(x+h))²]
2. Bin pairs by distance into ~15 bins up to max-distance / 2
3. Fit the selected model (spherical, exponential, or Gaussian) via
   weighted least-squares to estimate nugget, sill, and range

### Variogram Models

- **Spherical** (default): γ(h) = c₀ + c·[1.5(h/a) - 0.5(h/a)³] for h ≤ a, c₀+c for h > a
- **Exponential**: γ(h) = c₀ + c·[1 - exp(-3h/a)]
- **Gaussian**: γ(h) = c₀ + c·[1 - exp(-3h²/a²)]

Where c₀ = nugget, c = sill - nugget, a = range.

## Kriging Evaluation (in `evaluate()`)

For each query point:
1. Find k nearest neighbors using KDBush spatial index (cap at ~25)
2. Build k×k covariance matrix C from variogram model
3. Build k×1 covariance vector c₀ between query point and neighbors
4. Solve the Ordinary Kriging system (with Lagrange multiplier for unbiasedness):
   [C  1] [w]   [c₀]
   [1' 0] [μ] = [1 ]
5. Return weighted sum: Ẑ = Σ wᵢ·Z(xᵢ)

## Parameters (auto-generated UI)

| Key | Label | Type | Min | Max | Step | Default | Notes |
|-----|-------|------|-----|-----|------|---------|-------|
| variogramModel | Variogramm-Modell | number | 0 | 2 | 1 | 0 | 0=Sphärisch, 1=Exponentiell, 2=Gauß |
| nugget | Nugget (Messrauschen) | number | 0 | 1 | 0.05 | 0 | Fraction of total semivariance |
| maxNeighbors | Max. Nachbarn | number | 5 | 50 | 5 | 25 | Cap for per-pixel solve |

## Performance

- `prepare()`: O(n²) for variogram estimation + O(n log n) for KDBush
- `evaluate()`: O(k³) per pixel (k = maxNeighbors, typically 25)
  - The k³ solve is small enough (~15k multiplies for k=25) for real-time use
- Same center-and-scale normalization as TPS for numerical stability

## Files

| File | Action |
|------|--------|
| `src/common/interpolation/kriging.ts` | New — algorithm + variogram fitting |
| `src/common/interpolation/kriging.test.ts` | New — TDD tests |
| `src/common/interpolation/index.ts` | Add export + registerAlgorithm |
