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
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0
    ) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }

  // Build upper hull
  const upper: Point2D[] = [];
  for (let i = n - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0
    ) {
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
export function pointInPolygon(
  px: number,
  py: number,
  polygon: Point2D[]
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    if (
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
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
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Segment is a point
    const ex = px - ax,
      ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX,
    ey = py - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Minimum distance from point (px, py) to any edge of the polygon.
 */
export function distanceToPolygonEdge(
  px: number,
  py: number,
  polygon: Point2D[]
): number {
  let minDist = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distanceToSegment(
      px,
      py,
      polygon[i].x,
      polygon[i].y,
      polygon[j].x,
      polygon[j].y
    );
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
 * Returns a Uint8Array of length 1024 (256 entries x 4 bytes each).
 * Index i maps to RGBA at bytes [i*4, i*4+1, i*4+2, i*4+3].
 */
export function buildColorLUT(
  config: HeatmapConfig,
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
    stops = sorted.map((s) => ({
      t: (s.value - min) / range,
      color: s.color,
    }));
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
  stops = stops.map((s) => ({
    t: Math.max(0, Math.min(1, s.t)),
    color: s.color,
  }));

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
 * For each blockSize x blockSize pixel block, computes the IDW value,
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
        // For 1 point: circle boundary; for 2+ points: capsule (buffered line segments)
        let minDist: number;
        if (points.length === 1) {
          const dx = cx - points[0].x;
          const dy = cy - points[0].y;
          minDist = Math.sqrt(dx * dx + dy * dy);
        } else {
          // Distance to nearest line segment between consecutive points
          minDist = Infinity;
          for (let i = 0; i < points.length - 1; i++) {
            const d = distanceToSegment(
              cx,
              cy,
              points[i].x,
              points[i].y,
              points[i + 1].x,
              points[i + 1].y
            );
            if (d < minDist) minDist = d;
          }
        }
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
