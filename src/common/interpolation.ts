/**
 * Spatial interpolation utilities: convex hull, point-in-polygon,
 * distance calculations, IDW interpolation, and grid rendering.
 */

import KDBush from 'kdbush';
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
// Spatial Index
// ---------------------------------------------------------------------------

/**
 * Build a KDBush spatial index from data points for fast radius queries.
 */
export function buildSpatialIndex(points: DataPoint[]): KDBush {
  const index = new KDBush(points.length);
  for (let i = 0; i < points.length; i++) {
    index.add(points[i].x, points[i].y);
  }
  index.finish();
  return index;
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
    if (distSq < 1e-10) return points[i].value;

    const weight = 1 / Math.pow(distSq, power / 2);
    weightSum += weight;
    valueSum += weight * points[i].value;
  }

  return weightSum > 0 ? valueSum / weightSum : 0;
}

/**
 * Compute IDW interpolated value using a spatial index for fast neighbor lookup.
 * Only considers points within the given search radius, which produces nearly
 * identical results to the full scan since distant points have negligible weight.
 */
export function idwInterpolateIndexed(
  x: number,
  y: number,
  points: DataPoint[],
  power: number,
  index: KDBush,
  searchRadius: number
): number {
  const neighborIds = index.within(x, y, searchRadius);

  // Fallback: if no neighbors within radius, use the full set
  if (neighborIds.length === 0) {
    return idwInterpolate(x, y, points, power);
  }

  let weightSum = 0;
  let valueSum = 0;

  for (let i = 0; i < neighborIds.length; i++) {
    const pt = points[neighborIds[i]];
    const dx = x - pt.x;
    const dy = y - pt.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < 1e-10) return pt.value;

    const weight = 1 / Math.pow(distSq, power / 2);
    weightSum += weight;
    valueSum += weight * pt.value;
  }

  return weightSum > 0 ? valueSum / weightSum : 0;
}

// ---------------------------------------------------------------------------
// Thin-Plate Spline (TPS) Interpolation
// ---------------------------------------------------------------------------

export interface TpsWeights {
  /** Solved weights w_i for each input point */
  w: Float64Array;
  /** Polynomial coefficients [a0, a1, a2] */
  a: Float64Array;
  /** Input points snapshot used to solve (same reference as DataPoint[]) */
  points: DataPoint[];
}

/**
 * TPS radial basis function: φ(r) = r² ln(r), with φ(0) = 0.
 */
function tpsPhi(r: number): number {
  if (r < 1e-10) return 0;
  return r * r * Math.log(r);
}

/**
 * Solve the Thin-Plate Spline system for the given data points.
 * Returns weights and polynomial coefficients.
 *
 * Uses Gaussian elimination with partial pivoting.
 * Suitable for n ≤ 300 points (O(n²) memory, O(n³) time — done once per render).
 */
export function solveTPS(points: DataPoint[]): TpsWeights {
  const n = points.length;
  const size = n + 3;

  // Build matrix A (row-major, flattened) and RHS vector b
  const A = new Float64Array(size * size);
  const b = new Float64Array(size);

  // Top-left n×n block: K[i][j] = φ(||p_i - p_j||)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const r = Math.sqrt(dx * dx + dy * dy);
      A[i * size + j] = tpsPhi(r);
    }
  }

  // Top-right n×3 and bottom-left 3×n blocks: [1, x, y]
  for (let i = 0; i < n; i++) {
    A[i * size + n] = 1;
    A[i * size + n + 1] = points[i].x;
    A[i * size + n + 2] = points[i].y;
    A[n * size + i] = 1;
    A[(n + 1) * size + i] = points[i].x;
    A[(n + 2) * size + i] = points[i].y;
  }
  // Bottom-right 3×3 block: already zero (Float64Array is zero-initialised)

  // RHS: data values, then three zeros
  for (let i = 0; i < n; i++) {
    b[i] = points[i].value;
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < size; col++) {
    // Find pivot
    let maxVal = Math.abs(A[col * size + col]);
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      const v = Math.abs(A[row * size + col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }
    // Swap rows
    if (maxRow !== col) {
      for (let k = 0; k < size; k++) {
        const tmp = A[col * size + k];
        A[col * size + k] = A[maxRow * size + k];
        A[maxRow * size + k] = tmp;
      }
      const tmp = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmp;
    }
    // Eliminate below
    const pivot = A[col * size + col];
    if (Math.abs(pivot) < 1e-14) continue; // singular/near-singular row
    for (let row = col + 1; row < size; row++) {
      const factor = A[row * size + col] / pivot;
      for (let k = col; k < size; k++) {
        A[row * size + k] -= factor * A[col * size + k];
      }
      b[row] -= factor * b[col];
    }
  }

  // Back-substitution
  const x = new Float64Array(size);
  for (let row = size - 1; row >= 0; row--) {
    let sum = b[row];
    for (let col = row + 1; col < size; col++) {
      sum -= A[row * size + col] * x[col];
    }
    const diag = A[row * size + row];
    x[row] = Math.abs(diag) < 1e-14 ? 0 : sum / diag;
  }

  return {
    w: x.slice(0, n),
    a: x.slice(n, n + 3),
    points,
  };
}

/**
 * Evaluate a solved TPS at point (x, y).
 */
export function evaluateTPS(x: number, y: number, tps: TpsWeights): number {
  let value = tps.a[0] + tps.a[1] * x + tps.a[2] * y;
  const pts = tps.points;
  for (let i = 0; i < pts.length; i++) {
    const dx = x - pts[i].x;
    const dy = y - pts[i].y;
    const r = Math.sqrt(dx * dx + dy * dy);
    value += tps.w[i] * tpsPhi(r);
  }
  return value;
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
 *
 * Boundary uses a hybrid approach:
 * - Inside the convex hull AND within proximity of data → filled surface
 * - Inside hull but far from any data → skipped (prevents empty hull corners)
 * - Outside hull but within bufferPx of data → rendered with fade
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

  // Build spatial index for fast neighbor queries.
  const spatialIndex = buildSpatialIndex(points);
  // IDW search radius: 5× buffer gives enough nearby points for accurate
  // interpolation while skipping distant points with negligible weight.
  const searchRadius = bufferPx * 5;
  // Max proximity for interior hull cells: cells inside the hull are rendered
  // if they have a data point within this distance. This prevents filling
  // large empty areas inside the convex hull (e.g. between distant flight lines).
  const interiorMaxDist = bufferPx * 3;

  for (let by = 0; by < canvasHeight; by += blockSize) {
    for (let bx = 0; bx < canvasWidth; bx += blockSize) {
      const cx = bx + blockSize / 2;
      const cy = by + blockSize / 2;

      // Hybrid boundary: convex hull + point proximity.
      // Only alpha (opacity) is used for fading — the interpolated COLOR is
      // never distorted. IDW handles value blending naturally between points.
      let alpha = 1.0;

      if (isDegenerate) {
        // For < 3 non-collinear points: use pure point-proximity boundary
        const nearbyIds = spatialIndex.within(cx, cy, bufferPx);
        if (nearbyIds.length === 0) continue;
        let nearestDistSq = Infinity;
        for (let i = 0; i < nearbyIds.length; i++) {
          const pt = points[nearbyIds[i]];
          const dx = cx - pt.x;
          const dy = cy - pt.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < nearestDistSq) nearestDistSq = dSq;
        }
        const nearestDist = Math.sqrt(nearestDistSq);
        alpha = 1 - nearestDist / bufferPx;
      } else {
        const insideHull = pointInPolygon(cx, cy, hull);

        if (insideHull) {
          // Inside hull: check proximity to data points.
          // Skip if too far from any point (empty area inside convex hull).
          const nearbyIds = spatialIndex.within(cx, cy, interiorMaxDist);
          if (nearbyIds.length === 0) continue;

          // Find nearest point distance
          let nearestDistSq = Infinity;
          for (let i = 0; i < nearbyIds.length; i++) {
            const pt = points[nearbyIds[i]];
            const dx = cx - pt.x;
            const dy = cy - pt.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < nearestDistSq) nearestDistSq = dSq;
          }
          const nearestDist = Math.sqrt(nearestDistSq);

          // Fade alpha only in interior gaps (far from all data points).
          // No hull-edge fade — the outside-hull proximity fade handles
          // the outer boundary, avoiding a double-fade artifact.
          if (nearestDist > bufferPx) {
            alpha = 1 - (nearestDist - bufferPx) / (interiorMaxDist - bufferPx);
          }
        } else {
          // Outside hull: render within bufferPx of a data point with fade
          const nearbyIds = spatialIndex.within(cx, cy, bufferPx);
          if (nearbyIds.length === 0) continue;

          let nearestDistSq = Infinity;
          for (let i = 0; i < nearbyIds.length; i++) {
            const pt = points[nearbyIds[i]];
            const dx = cx - pt.x;
            const dy = cy - pt.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < nearestDistSq) nearestDistSq = dSq;
          }
          const nearestDist = Math.sqrt(nearestDistSq);
          alpha = 1 - nearestDist / bufferPx;
        }
      }

      // Compute IDW value — color is purely from interpolation, no value fade.
      const value = idwInterpolateIndexed(cx, cy, points, power, spatialIndex, searchRadius);
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
