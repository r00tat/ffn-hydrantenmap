# Spatial Interpolation Algorithm

Technical description of the IDW interpolation rendering pipeline used for map overlay visualization.

**Last updated:** 2026-03-13

## Overview

The interpolation overlay renders a continuous color surface on the map from discrete data points (e.g. measurement values at specific locations). It uses **Inverse Distance Weighting (IDW)** to estimate values at every pixel, with a **hybrid convex-hull + point-proximity boundary** to control where the surface is drawn.

## Pipeline

```
Firebase Records → lat/lng + value extraction → pixel coordinate conversion → IDW grid rendering → canvas overlay
```

### Stage 1: Data Collection

Records are fetched from Firestore for the active layer. Each record with a valid lat/lng and a numeric value for the configured field becomes a data point.

### Stage 2: Coordinate Conversion

**File:** `InterpolationOverlay.tsx`

Lat/lng coordinates are converted to pixel coordinates relative to the current map viewport. A pixel buffer (derived from `interpolationRadius` in meters) is added around the viewport so interpolation at edges isn't clipped.

```
bufferPx = metersToPixelsAtZoom(radiusMeters, centerLat, zoom)
canvasSize = viewportSize + 2 × bufferPx
```

### Stage 3: Spatial Indexing

**File:** `interpolation.ts` → `buildSpatialIndex()`

A **KDBush** spatial index is built from all data points. This enables O(k) radius queries instead of O(n) full scans, critical for performance with >100 points.

### Stage 4: Convex Hull

**File:** `interpolation.ts` → `computeConvexHull()`

A **Graham scan** computes the convex hull of all data points. The hull defines the "interior" region where the surface is filled without proximity constraints. If fewer than 3 non-collinear points exist, the hull is considered degenerate and only point-proximity rendering is used.

### Stage 5: Grid Rendering

**File:** `interpolation.ts` → `buildInterpolationGrid()`

The canvas is divided into blocks of `blockSize × blockSize` pixels (default 4×4). For each block center, the algorithm determines:

1. **Whether to render** (boundary check)
2. **What color** (IDW interpolation → normalization → color LUT lookup)
3. **What opacity** (alpha fading at boundaries)

#### Boundary Logic (Hybrid Hull + Proximity)

Three zones determine rendering behavior:

```
┌─────────────────────────────────────────┐
│           Empty (not rendered)           │
│                                         │
│    ┌── bufferPx ──┐                     │
│    │  Outside hull │ ← alpha fades      │
│    │  near a point │   from 1→0         │
│    │               │                     │
│    │  ┌─ HULL ──────────────────┐       │
│    │  │                         │       │
│    │  │  Inside hull            │       │
│    │  │  near data → alpha = 1  │       │
│    │  │                         │       │
│    │  │  Inside hull, far from  │       │
│    │  │  data → alpha fades     │       │
│    │  │  (prevents empty hull   │       │
│    │  │   corners from filling) │       │
│    │  │                         │       │
│    │  └─────────────────────────┘       │
│    └────────────────┘                    │
│                                         │
└─────────────────────────────────────────┘
```

**Inside the convex hull:**
- Find nearest data point within `interiorMaxDist` (= 3 × bufferPx)
- If no point within range → skip (don't render)
- If nearest point ≤ bufferPx → full opacity (alpha = 1.0)
- If nearest point between bufferPx and interiorMaxDist → linear alpha fade from 1→0
- No hull-edge fade is applied (the outside-hull proximity fade handles outer boundaries)

**Outside the convex hull:**
- Find nearest data point within bufferPx
- If no point within range → skip
- Linear alpha fade: `alpha = 1 - nearestDist / bufferPx`

**Degenerate hull (< 3 non-collinear points):**
- Pure point-proximity: render within bufferPx of any point with linear alpha fade

#### Key Design Decision: Alpha-Only Fading

The interpolated **color** is never distorted by boundary proximity. IDW naturally blends values between nearby points. Only **alpha (opacity)** is used for boundary transitions. This prevents artifacts like:
- Color shifting toward min/max at boundaries
- Double-fade effects (color fade + alpha fade stacking)

#### IDW Interpolation

For each rendered block center at position (x, y):

```
value = Σ(wᵢ × vᵢ) / Σ(wᵢ)

where wᵢ = 1 / dᵢᵖ
      dᵢ = distance to point i
      p  = power parameter (default 2)
      vᵢ = value at point i
```

**Optimizations:**
- Distance weight computed as `1 / Math.pow(distSq, power/2)` — avoids a separate `Math.sqrt()` call
- Spatial index limits computation to nearby points (search radius = 5 × bufferPx)
- Epsilon threshold `distSq < 1e-10` for exact-point hits (zoom-independent)

### Stage 6: Color Mapping

**File:** `interpolation.ts` → `buildColorLUT()`

A 256-entry RGBA lookup table (LUT) maps normalized values [0, 1] to colors.

**Auto mode:** Green → Yellow → Red gradient (or inverted)
**Manual mode:** User-defined color stops with min/max range

The IDW value is normalized to [0, 1] using the data range, then the LUT index is:
```
lutIndex = round(clamp(normalized, 0, 1) × 255)
```

Final pixel alpha combines the LUT alpha (from configured opacity) with the boundary alpha:
```
finalAlpha = round(lutAlpha × boundaryAlpha)
```

### Stage 7: Canvas Display

**File:** `InterpolationOverlay.tsx`

A custom Leaflet layer (`L.Layer.extend`) manages an HTML canvas element positioned over the map. On each `moveend` event, the canvas is resized/repositioned and the grid is re-rendered.

## Click Interaction

**File:** `HeatmapOverlayLayer.tsx`

Clicking on the colored surface shows a popup with the interpolated value at that location. The click handler:
1. Converts click lat/lng to meter-space coordinates
2. Checks if click is within `bufferPx` of any data point (simple proximity, no hull check)
3. Computes IDW value at click position
4. Shows popup with field label, rounded value, and unit

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `interpolationRadius` | 30m | Buffer distance around data points (meters) |
| `interpolationPower` | 2 | IDW power parameter (higher = more local influence) |
| `interpolationOpacity` | 0.6 | Maximum opacity of the overlay |
| `colorMode` | auto | `auto` (green-yellow-red) or `manual` (custom stops) |
| `invertAutoColor` | false | Swap green/red ends of auto gradient |
| `blockSize` | 4 | Pixel block size for grid rendering |

## Performance Characteristics

| Points | Viewport 1920×1080, blockSize=4 | Notes |
|--------|--------------------------------|-------|
| 10 | ~5ms | Spatial index overhead negligible |
| 100 | ~15ms | KDBush provides ~2.5× speedup |
| 500 | ~30ms | KDBush provides ~7× speedup |
| 1000 | ~40ms | KDBush provides ~10× speedup |

The main bottleneck at high point counts shifts from IDW computation to canvas `putImageData` and Leaflet repainting.
