# Interpolation Max-Value Marker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** In interpolation mode, place a map marker at the input point with the highest value, showing the value and unit.

**Architecture:** Add a `maxPoint` memo to `HeatmapOverlayLayer` derived from `heatmapPoints`. Render a React Leaflet `<Marker>` with a `DivIcon` alongside the existing `<InterpolationOverlay>`. Only shown when `isInterpolation` is true, the layer is visible, and there is at least one point.

**Tech Stack:** React Leaflet (`react-leaflet`), Leaflet (`leaflet`), TypeScript, Next.js App Router.

---

### Task 1: Add max-point marker to HeatmapOverlayLayer

**Files:**
- Modify: `src/components/Map/layers/HeatmapOverlayLayer.tsx`

The component already imports `L` from `leaflet` and `useMap` from `react-leaflet`. `fieldInfo` already has `label` and `unit`. We need to:

1. Import `Marker` from `react-leaflet`
2. Compute `maxPoint` memo
3. Build a `DivIcon`
4. Render the marker in JSX

**Step 1: Add `Marker` import**

In the imports section of `HeatmapOverlayLayer.tsx`, add `Marker` to the `react-leaflet` import:

```ts
import { useMap, Marker } from 'react-leaflet';
```

**Step 2: Add `maxPoint` memo**

After the `refLat` memo (around line 107), add:

```ts
const maxPoint = useMemo(
  () =>
    heatmapPoints.length === 0
      ? null
      : heatmapPoints.reduce((best, p) => (p.value > best.value ? p : best)),
  [heatmapPoints],
);
```

**Step 3: Build the `DivIcon` and marker element**

The icon is built lazily inside the render (no extra effect needed — `L.divIcon` is pure):

```ts
const maxMarkerIcon = useMemo(() => {
  if (!maxPoint || !fieldInfo) return null;
  const rounded = Math.round(maxPoint.value * 100) / 100;
  const label = `${rounded}${fieldInfo.unit ? '\u00a0' + fieldInfo.unit : ''}`;
  const html = `
    <div style="
      background:#b71c1c;
      color:#fff;
      font-weight:bold;
      font-size:12px;
      padding:3px 7px;
      border-radius:4px;
      white-space:nowrap;
      box-shadow:0 1px 4px rgba(0,0,0,0.5);
      position:relative;
    ">
      ${label}
      <div style="
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        bottom:-6px;
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:6px solid #b71c1c;
      "></div>
    </div>`;
  return L.divIcon({
    html,
    className: '',
    iconAnchor: [0, 0], // will be corrected by iconSize below
    iconSize: undefined,
    popupAnchor: [0, -10],
  });
}, [maxPoint, fieldInfo]);
```

> Note: `iconAnchor` can't be set to the exact pixel width without measuring DOM. Use `iconAnchor: [0, 30]` as an approximate center-bottom anchor (the label is ~28px tall; adjust if needed). Alternatively, set it to `[0, 0]` and let users see it; the triangle already visually points to the location.

A cleaner anchor: use `iconAnchor` calculated from the label string length (approx 7px per char + 14px padding), height 28px:

```ts
const approxWidth = label.length * 7 + 14;
return L.divIcon({
  html,
  className: '',
  iconAnchor: [approxWidth / 2, 28 + 6], // center-x, bottom including triangle
  iconSize: [approxWidth, 34],
  popupAnchor: [0, -34],
});
```

**Step 4: Update the JSX return**

Replace the final return block:

```tsx
if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey || heatmapPoints.length === 0) {
  return null;
}

return isInterpolation ? (
  <>
    <InterpolationOverlay
      points={heatmapPoints}
      config={heatmapConfig}
      allValues={allValues}
      layerRef={interpLayerRef}
    />
    {visible !== false && maxPoint && maxMarkerIcon && (
      <Marker
        position={[maxPoint.lat, maxPoint.lng]}
        icon={maxMarkerIcon}
        zIndexOffset={1000}
      />
    )}
  </>
) : (
  <HeatmapOverlay points={heatmapPoints} config={heatmapConfig} allValues={allValues} />
);
```

**Step 5: Run linter**

```bash
npm run lint
```

Expected: no errors. Fix any TypeScript type issues (e.g. `visible` prop type may need `visible !== false` guard since it's `visible?: boolean`).

**Step 6: Smoke test in browser**

Run `npm run dev`, open a firecall with a heatmap layer in interpolation mode. Verify:
- A red label marker appears at the location with the highest value.
- The marker disappears when switching to classic heatmap mode.
- The marker label shows the correct value and unit.

**Step 7: Commit**

```bash
git checkout -- next-env.d.ts
git add src/components/Map/layers/HeatmapOverlayLayer.tsx
git commit -m "feat(interpolation): mark peak value with a map label marker"
```

---

## Notes

- `Marker` from `react-leaflet` works inside `HeatmapOverlayLayer` because the component is rendered within a `<MapContainer>` tree (confirmed by existing `useMap()` call).
- `L.divIcon` with `className: ''` suppresses Leaflet's default white-box background.
- If `fieldInfo` is null (no data schema defined for the layer), the marker is not rendered (safe fallback).
- The `visible` prop controls the click handler already; it's `undefined` when not passed, so `visible !== false` is the correct guard.
