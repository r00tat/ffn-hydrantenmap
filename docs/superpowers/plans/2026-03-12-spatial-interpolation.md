# Spatial Interpolation Overlay Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IDW spatial interpolation as an alternative visualization mode to the existing heatmap overlay system.

**Architecture:** A new canvas-based Leaflet layer renders IDW-interpolated values on a 4px grid, bounded by the convex hull of measurement points plus a buffer radius. The user selects "Heatmap" or "Interpolation" mode in the layer settings. Both modes share the same color scale configuration.

**Tech Stack:** TypeScript, Leaflet L.Layer, Canvas 2D API, React, MUI

**Spec:** `docs/superpowers/specs/2026-03-12-spatial-interpolation-design.md`

**Worktree:** `.worktrees/feature-marker-data-fields`

**Important context:**
- No test framework (jest/vitest) is installed. Unit tests are out of scope for this plan. Verification is done via `npm run lint` and `npm run build`.
- The worktree is on branch `feature/marker-data-fields`. Create a new branch `feature/spatial-interpolation` from it.
- All file paths are relative to the worktree root.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/common/interpolation.ts` | **New.** Pure utility functions: convex hull, point-in-polygon, distance-to-edge, IDW computation, color LUT builder, grid builder |
| `src/components/Map/layers/InterpolationOverlay.tsx` | **New.** Canvas-based Leaflet layer component for rendering the interpolation surface |
| `src/components/firebase/firestore.ts` | **Modify.** Add interpolation fields to `HeatmapConfig` interface |
| `src/common/heatmap.ts` | **Modify.** Add `normalizeValueFull()` function (maps to [0,1] without the 0.3 floor) |
| `src/components/FirecallItems/HeatmapSettings.tsx` | **Modify.** Add visualization mode toggle and interpolation-specific sliders |
| `src/components/Map/layers/HeatmapOverlayLayer.tsx` | **Modify.** Conditionally render HeatmapOverlay or InterpolationOverlay |
| `src/components/Map/layers/FirecallLayer.tsx` | **Modify.** Update LayersControl overlay name based on visualization mode |
| `src/components/Map/HeatmapLegend.tsx` | **Modify.** Add mode label indicator |

---

## Chunk 1: Core Interpolation Utilities

### Task 1: Add interpolation fields to HeatmapConfig

**Files:**
- Modify: `src/components/firebase/firestore.ts:69-82`

- [ ] **Step 1: Add new fields to HeatmapConfig interface**

In `src/components/firebase/firestore.ts`, add 4 new optional fields to `HeatmapConfig`:

```typescript
export interface HeatmapConfig {
  enabled: boolean;
  activeKey: string;
  colorMode: 'auto' | 'manual';
  /** When true, auto mode uses red→yellow→green (low=red, high=green) */
  invertAutoColor?: boolean;
  /** Heatmap overlay radius in meters (default 30) */
  radius?: number;
  /** Heatmap overlay blur in pixels (default 15) */
  blur?: number;
  min?: number;
  max?: number;
  colorStops?: { value: number; color: string }[];
  /** Visualization mode: 'heatmap' (default) or 'interpolation' */
  visualizationMode?: 'heatmap' | 'interpolation';
  /** IDW buffer radius in meters beyond convex hull boundary (default 50) */
  interpolationRadius?: number;
  /** IDW power parameter — higher = sharper transitions near points (default 2) */
  interpolationPower?: number;
  /** Interpolation surface opacity 0-1 (default 0.6) */
  interpolationOpacity?: number;
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd .worktrees/feature-marker-data-fields && npm run lint`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add interpolation fields to HeatmapConfig interface"
```

---

### Task 2: Add normalizeValueFull to heatmap utilities

**Files:**
- Modify: `src/common/heatmap.ts`

- [ ] **Step 1: Add normalizeValueFull function**

Add this function after the existing `normalizeValue` in `src/common/heatmap.ts`:

```typescript
/**
 * Normalize a value to full 0-1 range for direct canvas rendering.
 * Unlike normalizeValue() which maps to [0.3, 1.0] for leaflet.heat,
 * this uses the full range since we control RGBA directly.
 */
export function normalizeValueFull(
  value: number,
  config: HeatmapConfig,
  allValues: number[]
): number {
  let min: number;
  let max: number;

  if (config.colorMode === 'manual' && config.min !== undefined && config.max !== undefined) {
    min = config.min;
    max = config.max;
  } else {
    min = allValues.reduce((a, b) => Math.min(a, b), Infinity);
    max = allValues.reduce((a, b) => Math.max(a, b), -Infinity);
  }

  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/common/heatmap.ts
git commit -m "feat: add normalizeValueFull for direct canvas rendering"
```

---

### Task 3: Create interpolation.ts — geometry utilities

**Files:**
- Create: `src/common/interpolation.ts`

- [ ] **Step 1: Create the file with convex hull, point-in-polygon, and distance utilities**

```typescript
/**
 * Spatial interpolation utilities: convex hull, point-in-polygon,
 * distance calculations, IDW interpolation, and grid rendering.
 */

import { HeatmapConfig } from '../components/firebase/firestore';
import { normalizeValueFull } from './heatmap';

export interface Point2D {
  x: number;
  y: number;
}

export interface DataPoint extends Point2D {
  value: number;
}

// ---------------------------------------------------------------------------
// Convex Hull (Graham Scan)
// ---------------------------------------------------------------------------

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Compute the convex hull of a set of points using Graham scan.
 * Returns vertices in counter-clockwise order.
 * For < 3 points or collinear points, returns the input points as-is.
 */
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const n = sorted.length;

  // Build lower hull
  const lower: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }

  // Build upper hull
  const upper: Point2D[] = [];
  for (let i = n - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
      upper.pop();
    }
    upper.push(sorted[i]);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  const hull = lower.concat(upper);
  // If all points are collinear, hull will have <= 2 points
  return hull.length >= 3 ? hull : [...points];
}

// ---------------------------------------------------------------------------
// Point-in-Polygon (Ray Casting)
// ---------------------------------------------------------------------------

/**
 * Test if point (px, py) is inside a polygon defined by vertices.
 * Uses the ray-casting algorithm.
 */
export function pointInPolygon(px: number, py: number, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Distance to Polygon Edge
// ---------------------------------------------------------------------------

/**
 * Minimum distance from point (px, py) to a line segment (ax, ay)-(bx, by).
 */
export function distanceToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Segment is a point
    const ex = px - ax, ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX, ey = py - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Minimum distance from point (px, py) to any edge of the polygon.
 */
export function distanceToPolygonEdge(px: number, py: number, polygon: Point2D[]): number {
  let minDist = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distanceToSegment(px, py, polygon[i].x, polygon[i].y, polygon[j].x, polygon[j].y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ---------------------------------------------------------------------------
// IDW Interpolation
// ---------------------------------------------------------------------------

/**
 * Compute IDW interpolated value at (x, y) from data points.
 * Returns the raw interpolated value (not normalized).
 */
export function idwInterpolate(
  x: number,
  y: number,
  points: DataPoint[],
  power: number
): number {
  let weightSum = 0;
  let valueSum = 0;

  for (let i = 0; i < points.length; i++) {
    const dx = x - points[i].x;
    const dy = y - points[i].y;
    const distSq = dx * dx + dy * dy;

    // If very close to a data point, return its value directly
    if (distSq < 1) return points[i].value;

    const weight = 1 / Math.pow(Math.sqrt(distSq), power);
    weightSum += weight;
    valueSum += weight * points[i].value;
  }

  return weightSum > 0 ? valueSum / weightSum : 0;
}

// ---------------------------------------------------------------------------
// Color LUT
// ---------------------------------------------------------------------------

/**
 * Parse a hex color string to [r, g, b].
 */
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/**
 * Build a 256-entry RGBA lookup table from gradient config.
 * Returns a Uint8Array of length 1024 (256 entries × 4 bytes each).
 * Index i maps to RGBA at bytes [i*4, i*4+1, i*4+2, i*4+3].
 */
export function buildColorLUT(
  config: HeatmapConfig,
  allValues: number[],
  opacity: number
): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  const alpha = Math.round(opacity * 255);

  // Determine color stops
  let stops: { t: number; color: string }[];

  if (
    config.colorMode === 'manual' &&
    config.colorStops?.length &&
    config.colorStops.length >= 2 &&
    config.min !== undefined &&
    config.max !== undefined
  ) {
    const sorted = [...config.colorStops].sort((a, b) => a.value - b.value);
    const min = config.min;
    const max = config.max;
    const range = max - min || 1;
    stops = sorted.map((s) => ({ t: (s.value - min) / range, color: s.color }));
  } else {
    stops = config.invertAutoColor
      ? [
          { t: 0, color: '#ff0000' },
          { t: 0.5, color: '#ffff00' },
          { t: 1, color: '#00ff00' },
        ]
      : [
          { t: 0, color: '#00ff00' },
          { t: 0.5, color: '#ffff00' },
          { t: 1, color: '#ff0000' },
        ];
  }

  // Clamp stop t values to [0, 1]
  stops = stops.map((s) => ({ t: Math.max(0, Math.min(1, s.t)), color: s.color }));

  for (let i = 0; i < 256; i++) {
    const t = i / 255;

    // Find surrounding stops
    let lowerIdx = 0;
    let upperIdx = stops.length - 1;
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].t && t <= stops[s + 1].t) {
        lowerIdx = s;
        upperIdx = s + 1;
        break;
      }
    }
    if (t <= stops[0].t) {
      lowerIdx = 0;
      upperIdx = 0;
    }
    if (t >= stops[stops.length - 1].t) {
      lowerIdx = stops.length - 1;
      upperIdx = stops.length - 1;
    }

    const [r1, g1, b1] = hexToRgb(stops[lowerIdx].color);
    if (lowerIdx === upperIdx) {
      lut[i * 4] = r1;
      lut[i * 4 + 1] = g1;
      lut[i * 4 + 2] = b1;
      lut[i * 4 + 3] = alpha;
    } else {
      const segRange = stops[upperIdx].t - stops[lowerIdx].t;
      const segT = segRange === 0 ? 0 : (t - stops[lowerIdx].t) / segRange;
      const [r2, g2, b2] = hexToRgb(stops[upperIdx].color);
      lut[i * 4] = Math.round(r1 + (r2 - r1) * segT);
      lut[i * 4 + 1] = Math.round(g1 + (g2 - g1) * segT);
      lut[i * 4 + 2] = Math.round(b1 + (b2 - b1) * segT);
      lut[i * 4 + 3] = alpha;
    }
  }

  return lut;
}

// ---------------------------------------------------------------------------
// Grid Builder
// ---------------------------------------------------------------------------

/**
 * Build the full interpolation grid as an ImageData.
 *
 * For each blockSize×blockSize pixel block, computes the IDW value,
 * normalizes it, looks up the color in the LUT, and writes RGBA pixels.
 * Only renders inside the convex hull + buffer boundary.
 * The outer 20% of the buffer fades to transparent.
 */
export function buildInterpolationGrid(params: {
  canvasWidth: number;
  canvasHeight: number;
  points: DataPoint[];
  hull: Point2D[];
  bufferPx: number;
  power: number;
  opacity: number;
  colorLUT: Uint8Array;
  config: HeatmapConfig;
  allValues: number[];
  blockSize?: number;
}): ImageData {
  const {
    canvasWidth,
    canvasHeight,
    points,
    hull,
    bufferPx,
    power,
    opacity,
    colorLUT,
    config,
    allValues,
    blockSize = 4,
  } = params;

  const imageData = new ImageData(canvasWidth, canvasHeight);
  const data = imageData.data;
  const isDegenerate = hull.length < 3;
  const fadeStart = bufferPx * 0.8; // fade begins at 80% of buffer

  for (let by = 0; by < canvasHeight; by += blockSize) {
    for (let bx = 0; bx < canvasWidth; bx += blockSize) {
      const cx = bx + blockSize / 2;
      const cy = by + blockSize / 2;

      // Determine if this cell is inside the render boundary
      let alpha = 1.0;

      if (isDegenerate) {
        // For 1-2 points: use distance to nearest point
        let minDistSq = Infinity;
        for (let i = 0; i < points.length; i++) {
          const dx = cx - points[i].x;
          const dy = cy - points[i].y;
          minDistSq = Math.min(minDistSq, dx * dx + dy * dy);
        }
        const minDist = Math.sqrt(minDistSq);
        if (minDist > bufferPx) continue; // outside
        if (minDist > fadeStart) {
          alpha = 1 - (minDist - fadeStart) / (bufferPx - fadeStart);
        }
      } else {
        const inside = pointInPolygon(cx, cy, hull);
        if (!inside) {
          const edgeDist = distanceToPolygonEdge(cx, cy, hull);
          if (edgeDist > bufferPx) continue; // outside buffer
          if (edgeDist > fadeStart) {
            alpha = 1 - (edgeDist - fadeStart) / (bufferPx - fadeStart);
          }
        }
      }

      // Compute IDW value
      const value = idwInterpolate(cx, cy, points, power);
      const normalized = normalizeValueFull(value, config, allValues);
      const lutIdx = Math.round(Math.max(0, Math.min(1, normalized)) * 255);

      // Look up color from LUT
      const r = colorLUT[lutIdx * 4];
      const g = colorLUT[lutIdx * 4 + 1];
      const b = colorLUT[lutIdx * 4 + 2];
      const a = Math.round(colorLUT[lutIdx * 4 + 3] * alpha);

      // Fill the block
      const maxY = Math.min(by + blockSize, canvasHeight);
      const maxX = Math.min(bx + blockSize, canvasWidth);
      for (let py = by; py < maxY; py++) {
        for (let px = bx; px < maxX; px++) {
          const idx = (py * canvasWidth + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }

  return imageData;
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/common/interpolation.ts
git commit -m "feat: add spatial interpolation utilities (IDW, convex hull, grid builder)"
```

---

## Chunk 2: Interpolation Overlay Component

### Task 4: Create InterpolationOverlay Leaflet layer component

**Files:**
- Create: `src/components/Map/layers/InterpolationOverlay.tsx`

- [ ] **Step 1: Create the component**

This follows the same pattern as `HeatmapOverlay.tsx` — a custom `L.Layer` that renders on a canvas in the overlay pane.

```typescript
'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { HeatmapConfig } from '../../firebase/firestore';
import {
  buildColorLUT,
  buildInterpolationGrid,
  computeConvexHull,
  DataPoint,
} from '../../../common/interpolation';

/**
 * Convert a distance in meters to pixels at a specific zoom level and latitude.
 * (Same function as in HeatmapOverlay.tsx)
 */
function metersToPixelsAtZoom(meters: number, lat: number, zoom: number): number {
  const metersPerPx =
    (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / metersPerPx;
}

// ---------------------------------------------------------------------------
// Custom Leaflet Layer for IDW interpolation
// ---------------------------------------------------------------------------

const InterpolationCanvasLayer = L.Layer.extend({
  options: {
    radiusMeters: 50,
    power: 2,
    opacity: 0.6,
    config: null as HeatmapConfig | null,
    allValues: [] as number[],
  },

  initialize(
    this: {
      _latlngs: [number, number, number][];
      _centerLat: number;
    } & L.Layer,
    latlngs: [number, number, number][],
    centerLat: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
  ) {
    this._latlngs = latlngs;
    this._centerLat = centerLat;
    L.setOptions(this, options);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAdd(this: any, map: L.Map) {
    this._map = map;

    const canvas = (this._canvas = L.DomUtil.create(
      'canvas',
      'leaflet-interpolation-layer leaflet-layer leaflet-zoom-hide',
    ) as HTMLCanvasElement);
    const originProp = L.DomUtil.testProp([
      'transformOrigin',
      'WebkitTransformOrigin',
      'msTransformOrigin',
    ]);
    if (originProp) canvas.style[originProp as unknown as number] = '50% 50%';

    map.getPanes().overlayPane.appendChild(canvas);
    map.on('moveend', this._reset, this);
    this._reset();
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRemove(this: any, map: L.Map) {
    map.getPanes().overlayPane.removeChild(this._canvas);
    map.off('moveend', this._reset, this);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _reset(this: any) {
    if (!this._map) return;

    const map: L.Map = this._map;
    const zoom = map.getZoom();
    const size = map.getSize();

    const bufferPx = Math.max(
      5,
      Math.round(
        metersToPixelsAtZoom(this.options.radiusMeters, this._centerLat, zoom),
      ),
    );

    const canvasW = size.x + 2 * bufferPx;
    const canvasH = size.y + 2 * bufferPx;

    const canvas: HTMLCanvasElement = this._canvas;
    canvas.width = canvasW;
    canvas.height = canvasH;

    const topLeft = map.containerPointToLayerPoint(L.point(-bufferPx, -bufferPx));
    L.DomUtil.setPosition(canvas, topLeft);

    // Convert lat/lng data to pixel coordinates (offset by bufferPx)
    const dataPoints: DataPoint[] = [];
    for (let i = 0; i < this._latlngs.length; i++) {
      const ll = this._latlngs[i];
      const p = map.latLngToContainerPoint(L.latLng(ll[0], ll[1]));
      dataPoints.push({
        x: Math.round(p.x + bufferPx),
        y: Math.round(p.y + bufferPx),
        value: ll[2],
      });
    }

    if (dataPoints.length === 0) return;

    const hull = computeConvexHull(dataPoints);
    const config: HeatmapConfig = this.options.config;
    const allValues: number[] = this.options.allValues;
    const colorLUT = buildColorLUT(config, allValues, this.options.opacity);

    const imageData = buildInterpolationGrid({
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      points: dataPoints,
      hull,
      bufferPx,
      power: this.options.power,
      opacity: this.options.opacity,
      colorLUT,
      config,
      allValues,
    });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
  },
});

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

interface InterpolationOverlayProps {
  points: { lat: number; lng: number; value: number }[];
  config: HeatmapConfig;
  allValues: number[];
}

export default function InterpolationOverlay({
  points,
  config,
  allValues,
}: InterpolationOverlayProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (points.length === 0) return;

    const data = points.map(
      (p) => [p.lat, p.lng, p.value] as [number, number, number],
    );

    const centerLat =
      points.reduce((sum, p) => sum + p.lat, 0) / points.length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = new (InterpolationCanvasLayer as any)(data, centerLat, {
      radiusMeters: config.interpolationRadius ?? 50,
      power: config.interpolationPower ?? 2,
      opacity: config.interpolationOpacity ?? 0.6,
      config,
      allValues,
    }) as L.Layer;

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, config, allValues]);

  return null;
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/InterpolationOverlay.tsx
git commit -m "feat: add InterpolationOverlay canvas layer component"
```

---

## Chunk 3: Wire Up Overlay Switching and UI

### Task 5: Update HeatmapOverlayLayer to support mode switching

**Files:**
- Modify: `src/components/Map/layers/HeatmapOverlayLayer.tsx`

- [ ] **Step 1: Add conditional rendering of InterpolationOverlay**

Add the import and conditional rendering logic. The key change: if `config.visualizationMode === 'interpolation'`, render `InterpolationOverlay` instead of `HeatmapOverlay`.

Add import at top:
```typescript
import InterpolationOverlay from './InterpolationOverlay';
```

Replace the JSX return (lines 77-93) with:
```tsx
  const isInterpolation = heatmapConfig.visualizationMode === 'interpolation';

  return (
    <>
      {isInterpolation ? (
        <InterpolationOverlay
          points={heatmapPoints}
          config={heatmapConfig}
          allValues={allValues}
        />
      ) : (
        <HeatmapOverlay
          points={heatmapPoints}
          config={heatmapConfig}
          allValues={allValues}
        />
      )}
      {layer.dataSchema && (
        <HeatmapLegend
          config={heatmapConfig}
          dataSchema={layer.dataSchema}
          allValues={allValues}
          layerName={layer.name}
        />
      )}
    </>
  );
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/HeatmapOverlayLayer.tsx
git commit -m "feat: conditionally render interpolation or heatmap overlay"
```

---

### Task 6: Update FirecallLayer overlay name in LayersControl

**Files:**
- Modify: `src/components/Map/layers/FirecallLayer.tsx:65-73`

- [ ] **Step 1: Change the LayersControl overlay name based on mode**

Replace the static `Heatmap` name with a dynamic one:

```tsx
{layer.heatmapConfig?.enabled && (
  <LayersControl.Overlay
    name={`${layer.name} ${layer.heatmapConfig.visualizationMode === 'interpolation' ? 'Interpolation' : 'Heatmap'}`}
    checked={false}
  >
    <LayerGroup>
      <HeatmapOverlayLayer layer={layer} />
    </LayerGroup>
  </LayersControl.Overlay>
)}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/FirecallLayer.tsx
git commit -m "feat: update LayersControl overlay name based on visualization mode"
```

---

### Task 7: Add mode label to HeatmapLegend

**Files:**
- Modify: `src/components/Map/HeatmapLegend.tsx`

- [ ] **Step 1: Add config prop usage and mode label**

The `config` prop is already passed. Add a mode label below the layer name:

After the existing `layerName` Typography block (line 87), add:

```tsx
<Typography variant="caption" display="block" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
  {config.visualizationMode === 'interpolation' ? 'Interpolation' : 'Heatmap'}
</Typography>
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/HeatmapLegend.tsx
git commit -m "feat: show visualization mode label in heatmap legend"
```

---

### Task 8: Add visualization mode toggle and interpolation settings to HeatmapSettings

**Files:**
- Modify: `src/components/FirecallItems/HeatmapSettings.tsx`

- [ ] **Step 1: Add the "Darstellung" toggle and interpolation-specific controls**

After the active key `TextField` (line 100), add the visualization mode toggle:

```tsx
<Typography variant="body2" gutterBottom>
  Darstellung
</Typography>
<ToggleButtonGroup
  value={current.visualizationMode || 'heatmap'}
  exclusive
  onChange={(_, val) => val && update({ visualizationMode: val })}
  size="small"
  sx={{ mb: 1 }}
>
  <ToggleButton value="heatmap">Heatmap</ToggleButton>
  <ToggleButton value="interpolation">Interpolation</ToggleButton>
</ToggleButtonGroup>
```

The existing Radius and Blur sliders (lines 189-216) should only show when mode is heatmap. When mode is interpolation, show different controls:

Replace the Radius and Blur `<Box>` sections with:

```tsx
{(current.visualizationMode || 'heatmap') === 'heatmap' ? (
  <>
    <Box>
      <Typography variant="body2" gutterBottom>
        Radius: {current.radius ?? 30}m
      </Typography>
      <Slider
        value={current.radius ?? 30}
        onChange={(_, val) => update({ radius: val as number })}
        min={10}
        max={1000}
        step={10}
        size="small"
        valueLabelDisplay="auto"
      />
    </Box>
    <Box>
      <Typography variant="body2" gutterBottom>
        Weichzeichner: {Math.round(((current.blur ?? 15) / 25) * 100)}%
      </Typography>
      <Slider
        value={current.blur ?? 15}
        onChange={(_, val) => update({ blur: val as number })}
        min={1}
        max={50}
        step={1}
        size="small"
        valueLabelDisplay="auto"
      />
    </Box>
  </>
) : (
  <>
    <Box>
      <Typography variant="body2" gutterBottom>
        Radius: {current.interpolationRadius ?? 50}m
      </Typography>
      <Slider
        value={current.interpolationRadius ?? 50}
        onChange={(_, val) => update({ interpolationRadius: val as number })}
        min={10}
        max={500}
        step={10}
        size="small"
        valueLabelDisplay="auto"
      />
    </Box>
    <Box>
      <Typography variant="body2" gutterBottom>
        IDW Exponent: {current.interpolationPower ?? 2}
      </Typography>
      <Slider
        value={current.interpolationPower ?? 2}
        onChange={(_, val) => update({ interpolationPower: val as number })}
        min={1}
        max={5}
        step={0.5}
        size="small"
        valueLabelDisplay="auto"
      />
    </Box>
    <Box>
      <Typography variant="body2" gutterBottom>
        Deckkraft: {Math.round((current.interpolationOpacity ?? 0.6) * 100)}%
      </Typography>
      <Slider
        value={current.interpolationOpacity ?? 0.6}
        onChange={(_, val) => update({ interpolationOpacity: val as number })}
        min={0.1}
        max={1}
        step={0.05}
        size="small"
        valueLabelDisplay="auto"
      />
    </Box>
  </>
)}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/components/FirecallItems/HeatmapSettings.tsx
git commit -m "feat: add visualization mode toggle and interpolation settings UI"
```

---

## Chunk 4: Verification

### Task 9: Full build verification

- [ ] **Step 1: Run lint**

Run: `cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature-marker-data-fields && npm run lint`
Expected: No errors

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript or compilation errors

- [ ] **Step 3: Manual verification checklist**

After `npm run dev`, verify in the browser:
1. Open a firecall with a layer that has `dataSchema` with numeric fields
2. Edit the layer → Heatmap section → enable heatmap
3. Verify "Darstellung" toggle appears with "Heatmap" and "Interpolation" options
4. Select "Interpolation" → verify Radius/IDW Exponent/Deckkraft sliders appear
5. Save → enable the overlay in LayersControl → verify interpolation surface renders
6. Switch back to "Heatmap" mode → verify classic heatmap renders
7. Verify legend shows "Interpolation" or "Heatmap" label
8. Verify LayersControl entry name changes with mode
