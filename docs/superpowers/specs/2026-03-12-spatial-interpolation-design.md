# Spatial Interpolation Overlay

**Date:** 2026-03-12
**Parent spec:** 2026-03-11-marker-data-fields-heatmap-design.md
**Branch:** feature/marker-data-fields (worktree)
**Status:** Draft

## Overview

Extend the heatmap visualization system to support IDW (Inverse Distance Weighting) spatial interpolation as an alternative visualization mode. Given sparse measurement points on a layer, the interpolation renders a continuous colored surface estimating values between the points, bounded by the convex hull of the measurement points plus a configurable buffer radius.

## Goals

- Add a "Heatmap" vs "Interpolation" toggle to the layer heatmap settings
- Render a continuous IDW-interpolated surface on a canvas overlay
- Bound the surface to the convex hull of measurement points + configurable buffer radius
- Reuse the existing color scale (auto/manual, colorStops) for both modes
- Zero new npm dependencies — pure canvas 2D rendering

## Non-Goals

- Kriging or other advanced geostatistical methods
- Server-side interpolation computation
- Contour lines / isolines (could be added later)
- Web Workers for computation (not needed for ≤100 points)

## Data Model Changes

### HeatmapConfig additions

```typescript
export interface HeatmapConfig {
  // ...existing fields (enabled, activeKey, colorMode, invertAutoColor, radius, blur, min, max, colorStops)

  /** Visualization mode: 'heatmap' (default) or 'interpolation' */
  visualizationMode?: 'heatmap' | 'interpolation';

  /** IDW buffer radius in meters beyond the convex hull boundary (default: 30) */
  interpolationRadius?: number;

  /** IDW power parameter — higher = sharper transitions near points (default: 2, range: 1-5) */
  interpolationPower?: number;

  /** Interpolation surface opacity 0-1 (default: 0.6) */
  interpolationOpacity?: number;
}
```

No changes to `FirecallItem`, `FirecallLayer`, or `DataSchemaField`. The `visualizationMode` field defaults to `'heatmap'` when undefined, preserving backward compatibility.

## Algorithm: IDW with Convex Hull Boundary

### IDW (Inverse Distance Weighting)

For each grid cell at position `(x, y)`, compute the interpolated value:

```
v(x,y) = Σ(wi * vi) / Σ(wi)
where wi = 1 / d(x, xi)^p
```

- `vi` = measured value at point `i`
- `d(x, xi)` = Euclidean distance from grid cell to point `i` (in pixel space)
- `p` = power parameter (`interpolationPower`, default 2)
- If distance < 1px, use the point's value directly (avoid division by zero)

### Convex Hull + Buffer Boundary

1. Compute the convex hull of all measurement points (Graham scan — sufficient for ≤100 points)
2. For each grid cell, determine if it falls within the render boundary:
   - **Inside the convex hull polygon** — always rendered
   - **Outside the hull but within `interpolationRadius` meters of any hull edge** — rendered with alpha fade
   - **Outside the buffer** — transparent (not drawn)
3. Alpha fade in the buffer zone: the outer 20% of the buffer radius fades from full opacity to transparent, creating a soft edge

### Degenerate cases

- **1 point:** Render a filled circle with radius = `interpolationRadius`, uniform color = point's value
- **2 points:** Render a buffered line (capsule shape) between the points, interpolating linearly
- **3+ collinear points:** Treated as a buffered line (hull degenerates to a line segment)

### Grid resolution

Fixed 4×4 pixel blocks. At typical zoom levels (15-19) for an incident scene, this provides sub-meter to ~5m real-world resolution. Recomputed on every Leaflet `moveend` event.

### Color mapping

**Normalization:** The existing `normalizeValue()` in `src/common/heatmap.ts` maps to `[0.3, 1.0]` — this floor exists because leaflet.heat's gradient starts from transparent. For the interpolation surface, where we control RGBA directly, a full `[0.0, 1.0]` range is needed. Add a new `normalizeValueFull(value, config, allValues): number` function that maps to `[0.0, 1.0]` without the 0.3 floor. Uses the same min/max/auto logic as the existing function.

**RGBA color lookup:** To avoid parsing hex strings per pixel in the hot loop, `interpolation.ts` will include a `buildColorLUT(config, allValues): Uint8Array` function that pre-builds a 256-entry lookup table (256 × 4 bytes = 1KB) mapping normalized intensity (0-255) to RGBA values. The gradient color stops (auto or manual) are sampled into this LUT once per render pass. During the grid loop, each IDW value maps to an index: `Math.round(normalized * 255)` → 4 bytes from the LUT. This avoids any per-pixel string parsing.

**Note on existing `radius` field:** The `HeatmapConfig.radius` JSDoc says "pixels" but the implementation in `HeatmapOverlay.tsx` uses it as meters (`radiusMeters`). Both the existing heatmap and the new interpolation treat `radius` as meters.

**Pixel-space vs geographic distance:** IDW distances are computed in pixel space (Euclidean distance between container pixel coordinates). This means interpolation results are not perfectly geographically stable across zoom levels — the same lat/lng may get slightly different interpolated values at different zooms because pixel distances change. For the use case (incident-scene visualization at consistent zoom levels), this is acceptable and avoids the overhead of computing Haversine distances per grid cell.

## Rendering: Canvas-based Leaflet Layer

### InterpolationLayer (custom L.Layer)

Follows the same pattern as `CustomHeatLayer` in `HeatmapOverlay.tsx`:

- Extends `L.Layer`
- Creates a `<canvas>` element in the overlay pane
- Canvas sized to viewport + padding (buffer radius in pixels on each side) — same edge-clipping fix as the existing heatmap layer
- On `moveend`: clears canvas and recomputes the grid

### Render loop (`_reset`)

1. Convert all measurement lat/lng to container pixel coordinates
2. Compute convex hull in pixel space
3. Compute buffer distance in pixels via `metersToPixelsAtZoom()` (reuse from `HeatmapOverlay.tsx`)
4. Create `ImageData` for the canvas dimensions
5. For each 4×4 pixel block:
   - Check if block center is inside hull+buffer boundary
   - If yes: compute IDW value → normalize → map to RGBA color
   - If in fade zone (outer 20% of buffer): multiply alpha by fade factor
   - If outside: skip
6. `putImageData()` to paint the entire surface in one call

### Performance

For 100 points on a 1920×1080 viewport at 4px grid: ~120k grid cells, each computing 100 distance+weight operations = ~12M operations. On desktop hardware this completes in <50ms. On mid-range mobile devices (tablets used by firefighters), expect 100-300ms — acceptable since it only runs on `moveend`, not during pan/zoom animation. If mobile performance becomes an issue, the block size can be increased to 8×8 (4× fewer cells) as a future optimization.

## Component: InterpolationOverlay.tsx

Same props interface as `HeatmapOverlay`:

```typescript
interface InterpolationOverlayProps {
  points: { lat: number; lng: number; value: number }[];
  config: HeatmapConfig;
  allValues: number[];
}
```

Same lifecycle pattern:
- `useMap()` to get the Leaflet map instance
- `useEffect` creates/removes the custom layer on data change
- Dynamically imported with `ssr: false` (no window dependency at import time, but canvas usage requires client)

## Utility: src/common/interpolation.ts

Pure functions, no side effects:

| Function | Purpose |
|----------|---------|
| `computeConvexHull(points: {x,y}[])` | Graham scan, returns hull vertices in order |
| `pointInPolygon(x, y, polygon: {x,y}[])` | Ray-casting point-in-polygon test |
| `distanceToPolygonEdge(x, y, polygon: {x,y}[])` | Min distance from point to any polygon edge |
| `distanceToSegment(px, py, ax, ay, bx, by)` | Distance from point to line segment (used by above) |
| `idwInterpolate(x, y, points: {x,y,value}[], power)` | Single-cell IDW computation, returns raw value |
| `normalizeValueFull(value, config, allValues)` | Normalize to [0.0, 1.0] range (no 0.3 floor) |
| `buildColorLUT(config, allValues): Uint8Array` | Pre-build 256-entry RGBA lookup table from gradient |
| `buildInterpolationGrid(params): ImageData` | Full grid computation (see signature below) |

**`buildInterpolationGrid` signature:**

```typescript
function buildInterpolationGrid(params: {
  canvasWidth: number;
  canvasHeight: number;
  points: { x: number; y: number; value: number }[];  // pixel coordinates
  hull: { x: number; y: number }[];                    // convex hull vertices
  bufferPx: number;                                     // buffer radius in pixels
  power: number;                                        // IDW exponent
  opacity: number;                                      // 0-1 surface opacity
  colorLUT: Uint8Array;                                 // 256×4 RGBA lookup table
  blockSize?: number;                                   // pixel block size (default: 4)
}): ImageData
```

## UI Changes

### HeatmapSettings.tsx

When heatmap is enabled, add a **"Darstellung"** (Visualization) section:

```
[Heatmap] [Interpolation]     ← ToggleButtonGroup
```

When "Interpolation" is selected, replace the existing Radius/Blur sliders with:

- **Radius (m)** — buffer distance beyond measurement points (Slider, 10-500m, default 30, step 10)
- **IDW Exponent** — power parameter (Slider, 1-5, default 2, step 0.5)
- **Deckkraft** (Opacity) — surface opacity (Slider, 10-100%, default 60%)

The color mode settings (Auto/Manual, invertAutoColor, min/max, colorStops) remain visible and shared between both modes.

### HeatmapLegend.tsx

Add a small mode label ("Heatmap" / "Interpolation") below the field name. No other changes — the gradient bar and min/max labels apply to both modes.

### HeatmapOverlayLayer.tsx

Conditionally render `HeatmapOverlay` or `InterpolationOverlay` based on `config.visualizationMode`:

```tsx
{config.visualizationMode === 'interpolation' ? (
  <InterpolationOverlay points={heatmapPoints} config={config} allValues={allValues} />
) : (
  <HeatmapOverlay points={heatmapPoints} config={config} allValues={allValues} />
)}
```

### FirecallLayer.tsx (LayersControl)

The overlay entry name reflects the active mode:
- `"{Layer name} Heatmap"` when `visualizationMode !== 'interpolation'`
- `"{Layer name} Interpolation"` when `visualizationMode === 'interpolation'`

## Affected Files

| File | Change |
|------|--------|
| `src/common/interpolation.ts` | **New:** IDW, convex hull, point-in-polygon, grid builder |
| `src/components/Map/layers/InterpolationOverlay.tsx` | **New:** Canvas-based Leaflet interpolation layer component |
| `src/components/firebase/firestore.ts` | Add `visualizationMode`, `interpolationRadius`, `interpolationPower`, `interpolationOpacity` to `HeatmapConfig` |
| `src/components/FirecallItems/HeatmapSettings.tsx` | Add "Darstellung" toggle, interpolation-specific settings |
| `src/components/Map/layers/HeatmapOverlayLayer.tsx` | Conditionally render Interpolation vs Heatmap overlay |
| `src/components/Map/layers/FirecallLayer.tsx` | Update LayersControl overlay name based on mode |
| `src/components/Map/HeatmapLegend.tsx` | Add mode label |

## Edge Cases

- **< 3 points:** See degenerate cases above (circle for 1, capsule for 2)
- **All same value:** Entire surface renders as one uniform color (midpoint color in auto mode, same as heatmap behavior)
- **No numeric values:** Surface not rendered (same guard as existing heatmap)
- **Mode switch:** Changing `visualizationMode` in dialog swaps the overlay on save. Each component fully cleans up via `useEffect` return — no stale canvas
- **Zoom performance:** Canvas pixel count bounded by viewport size regardless of zoom. 4px grid keeps cell count constant.
- **Points outside viewport:** IDW still considers all layer points for correct interpolation, not just visible ones. Only the rendering grid is clipped to viewport+padding.

## Scope

- **In scope:** IDW interpolation surface, convex hull boundary, buffer radius, UI toggle
- **Deferred:** Contour lines/isolines, Kriging, Web Worker offloading, cross-layer interpolation

## Implementation Notes

- The existing `HeatmapOverlay.tsx` contains debug drawing code (canvas borders, point circles, console logs) that should be removed before or during this work.
- Both `HeatmapOverlay` and `InterpolationOverlay` use direct imports in `HeatmapOverlayLayer.tsx` (not `next/dynamic`). This is fine because the parent component is already `'use client'` and only rendered within the dynamically-imported map tree.
- The `interpolationRadius` default of 30m matches the existing heatmap radius default. For wider point spacing, users can increase via the slider (up to 500m).
- Unit tests should cover the pure functions in `interpolation.ts`: `computeConvexHull`, `pointInPolygon`, `distanceToPolygonEdge`, `idwInterpolate`, and `buildColorLUT`.
