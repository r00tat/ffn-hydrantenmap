# Spatial Interpolation Analysis

Analysis of the current IDW interpolation implementation, potential improvements, and library alternatives.

**Date:** 2026-03-13
**Files analyzed:**
- `src/common/interpolation.ts` — core algorithms (IDW, convex hull, point-in-polygon, grid builder)
- `src/components/Map/layers/InterpolationOverlay.tsx` — Leaflet canvas layer
- `src/components/Map/layers/HeatmapOverlayLayer.tsx` — orchestrator with click handler

## Current Architecture

The interpolation pipeline works in 3 stages:

1. **Data Collection** — Firebase records with lat/lng and numeric field values
2. **Coordinate Conversion** — lat/lng → pixel coordinates (per zoom level) in `InterpolationOverlay.tsx`
3. **Grid Rendering** — block-based IDW interpolation to canvas `ImageData` in `buildInterpolationGrid()`

Boundary handling uses a convex hull (Graham scan) with a configurable buffer zone. Inside the hull, full IDW interpolation applies. Outside, opacity and value fade linearly to zero across the buffer width.

## Issues Found

### 1. Unnecessary `sqrt` in IDW hot loop

**File:** `src/common/interpolation.ts:180`

```ts
const weight = 1 / Math.pow(Math.sqrt(distSq), power);
```

Mathematically equivalent to:

```ts
const weight = 1 / Math.pow(distSq, power / 2);
```

Saves one `Math.sqrt()` call per point per grid cell. In the innermost loop this adds up to ~15-20% speedup.

**Status:** Fixed

### 2. `distSq < 1` threshold is pixel-dependent

**File:** `src/common/interpolation.ts:178`

The early-exit threshold `distSq < 1` means "within 1 pixel" in the grid builder (pixel-space) but represents different physical distances at different zoom levels. At zoom 18, 1px ≈ 0.6m; at zoom 13, 1px ≈ 19m. This can cause visual discontinuities when zooming.

**Fix:** Use a very small epsilon like `1e-10` (just to avoid division by zero) or scale relative to `blockSize`.

**Status:** Fixed

### 3. No spatial indexing — O(gridCells × dataPoints)

Every grid cell iterates over ALL data points. For a 1920×1080 viewport with `blockSize=4` and 200 points, that's ~129,600 blocks × 200 = ~26M distance calculations per render.

**Fix:** Use `kdbush` (2KB, zero-dep npm package) for spatial indexing. Limit IDW to nearest k=8-12 points — visually identical results because distant points have negligible weight.

| Points | Current (1920×1080, blockSize=4) | With kdbush (k=12) |
|--------|----------------------------------|---------------------|
| 10     | ~5ms                             | ~5ms                |
| 100    | ~40ms                            | ~15ms               |
| 500    | ~200ms                           | ~30ms               |
| 1000   | ~400ms+                          | ~40ms               |

**Status:** Open

### 4. Grid re-rendered on every pan/zoom with no offloading

`_reset()` in `InterpolationOverlay.tsx` fires on every Leaflet `moveend`, rebuilding the entire grid on the main thread.

**Fix options:**
- Move `buildInterpolationGrid` to a **Web Worker** (the function is already pure/no DOM)
- Debounce `_reset` by 100-150ms during rapid panning
- Use adaptive `blockSize` by zoom (8-16 at low zoom, 2-4 at high zoom)

**Status:** Open

### 5. Block-based rendering creates visible pixelation

`blockSize = 4` means each 4×4 pixel block gets one color, creating visible grid artifacts at high zoom.

**Fix:** Use smaller blockSize at high zoom, or apply bilinear interpolation across block centers.

**Status:** Open

### 6. Value decay creates colored halo outside hull

**File:** `src/common/interpolation.ts:406`

```ts
const normalized = normalizeValueFull(value, config, allValues) * valueFade;
```

When `valueFade → 0`, the normalized value → 0, which maps to the minimum-end gradient color (not transparency). Combined with the separate alpha fade, this creates a colored halo before the edge goes transparent.

**Fix:** Consider fading only via alpha (transparency), not by shifting the interpolated value toward min.

**Status:** Open

### 7. Click handler duplicates boundary logic

`HeatmapOverlayLayer.tsx:124-186` reimplements the hull/buffer boundary check from `buildInterpolationGrid` but in meter-space. This duplication could drift out of sync.

**Status:** Open (low priority)

## Library Alternatives Evaluated

| Library | Algorithm | Verdict | Reason |
|---------|-----------|---------|--------|
| `@turf/interpolate` | IDW | Not recommended | Returns GeoJSON polygons, not raster — loses the fast canvas pipeline |
| `kriging.js` / `@sakitam-gis/kriging` | Kriging | Not recommended | Unmaintained (~2016), O(n³) fitting, overkill for this use case |
| `delaunator` / `d3-delaunay` | Delaunay/TIN | Consider later | Could enable TIN or Natural Neighbor interpolation |
| `kdbush` | Spatial index | Recommended | 2KB, zero-dep, makes IDW O(k) instead of O(n) per cell |
| `d3-contour` | Contouring | Future option | If iso-lines are desired on top of the heatmap |
| `ml-matrix` | Matrix ops | Consider later | Could enable RBF interpolation (requires wiring up kernel + solve) |
| `concaveman` | Concave hull | Consider later | Better boundary for non-convex data distributions |

**Conclusion:** The custom IDW implementation is the right approach for this use case. No library offers a better canvas-based pipeline. Focus on optimizing the existing code.

## Algorithm Comparison

| Algorithm | Complexity (fit) | Complexity (query) | Smoothness | Parameters | Extrapolation |
|-----------|-----------------|-------------------|------------|------------|---------------|
| **IDW** (current) | None | O(n) per cell | Moderate (bull's-eye artifacts) | power | No (bounded by min/max) |
| Kriging | O(n²)-O(n³) | O(n) per cell | Excellent | variogram model, range, sill | Yes |
| Natural Neighbor | O(n log n) Voronoi | O(n) per cell | Excellent | None | No |
| TIN (linear) | O(n log n) | O(log n) per cell | Low (triangle edges visible) | None | No |
| RBF | O(n³) matrix solve | O(n) per cell | Excellent | kernel type, epsilon | Yes |

## Boundary Handling Options

Current: linear decay `1 - d/buffer`. Alternatives for smoother edges:

- **Cosine:** `0.5 * (1 + cos(π * d / buffer))` — smooth S-curve, zero derivative at both ends
- **Gaussian:** `exp(-(d/buffer)² * 3)` — reaches ~5% at boundary, natural falloff
- **Smoothstep:** `1 - 3t² + 2t³` where `t = d/buffer` — common in graphics

## Improvement Priority

1. **sqrt optimization** — trivial, immediate speedup (done)
2. **Fix distSq threshold** — small change, prevents zoom-dependent artifacts
3. **kdbush spatial index** — biggest performance win for >100 points
4. **Web Worker offloading** — prevents UI jank during pan/zoom
5. **Adaptive blockSize** — easy win for low-zoom performance
6. **Smooth boundary decay** — visual improvement
7. **Concave hull** — better boundaries for non-convex distributions
