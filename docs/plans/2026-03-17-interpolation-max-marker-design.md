# Design: Interpolation Max-Value Marker

**Date:** 2026-03-17
**Branch:** fix/spline-interpolation-null-crash

## Goal

When the interpolation heatmap is active, mark the input point with the highest raw value with a visible map marker showing the value and unit.

## Scope

- Applies only when `visualizationMode === 'interpolation'` (not the classic simpleheat mode).
- Marker is hidden when the layer is not visible.

## Approach

Use the max of the raw `heatmapPoints` array (Option A). For IDW — the most-used algorithm — the interpolation surface is guaranteed to peak at a source point, so this is always correct. For TPS spline, the source point with the highest raw value is the most meaningful landmark even if the surface overshoots slightly.

## Changes

**File:** `src/components/Map/layers/HeatmapOverlayLayer.tsx`

1. Add a `maxPoint` memo derived from `heatmapPoints`:
   ```ts
   const maxPoint = useMemo(
     () => heatmapPoints.length === 0
       ? null
       : heatmapPoints.reduce((best, p) => p.value > best.value ? p : best),
     [heatmapPoints],
   );
   ```

2. Import `Marker` and `Tooltip` from `react-leaflet` (or use a `DivIcon` imperatively if React Leaflet is not already used for JSX in this component).

3. Render a `<Marker>` with a `DivIcon` alongside `<InterpolationOverlay>` when `isInterpolation && visible !== false && maxPoint != null`. The icon shows `value + unit` (e.g. `42.3 ppm`) in a small label anchored with its tip on the coordinate.

## Marker styling

- Dark red background, white bold text, rounded corners, small downward-pointing triangle tip.
- Inline CSS on the `DivIcon` HTML — no additional dependencies.
- Icon anchored so the tip of the triangle sits on the lat/lng.

## Tests

No new tests required. The `maxPoint` derivation is a trivial `reduce`; the existing interpolation tests are unaffected.
