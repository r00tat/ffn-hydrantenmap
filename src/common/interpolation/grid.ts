/**
 * Algorithm-agnostic interpolation grid builder.
 * Extracted from interpolation.ts with the algorithm branching replaced
 * by a generic algorithm.evaluate() call.
 */

import { HeatmapConfig } from '../../components/firebase/firestore';
import { normalizeValueFull } from '../heatmap';
import type { DataPoint, InterpolationAlgorithm, Point2D } from './types';
import { buildSpatialIndex, pointInPolygon } from './utils';

/**
 * Build the full interpolation grid as an ImageData.
 *
 * For each blockSize x blockSize pixel block, calls algorithm.evaluate(),
 * normalizes the result, looks up the color in the LUT, and writes RGBA pixels.
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
  opacity: number;
  colorLUT: Uint8Array;
  config: HeatmapConfig;
  allValues: number[];
  blockSize?: number;
  /** The interpolation algorithm to use */
  algorithm: InterpolationAlgorithm<any>;
  /** Pre-computed state from algorithm.prepare() */
  state: unknown;
  /** Whether values were log-transformed before prepare() */
  logScale?: boolean;
}): { imageData: ImageData; valueGrid: Float32Array; gridCols: number } {
  const {
    canvasWidth,
    canvasHeight,
    points,
    hull,
    bufferPx,
    colorLUT,
    config,
    allValues,
    blockSize = 4,
    algorithm,
    state,
    logScale = false,
  } = params;

  const imageData = new ImageData(canvasWidth, canvasHeight);
  const data = imageData.data;
  const isDegenerate = hull.length < 3;

  // Value grid: stores the final interpolated value per block for click lookup.
  const gridCols = Math.ceil(canvasWidth / blockSize);
  const gridRows = Math.ceil(canvasHeight / blockSize);
  const valueGrid = new Float32Array(gridCols * gridRows).fill(NaN);

  // When log-scale is active, transform point values into log space before
  // interpolation and exp() the result afterwards.
  const safeLog = (v: number) => Math.log(Math.max(v, 1e-10));
  const interpPoints = logScale
    ? points.map((p) => ({ x: p.x, y: p.y, value: safeLog(p.value) }))
    : points;
  const interpAllValues = logScale ? allValues.map(safeLog) : allValues;

  // Data minimum for outside-hull value fade.
  let dataMinVal = Infinity;
  for (let i = 0; i < interpAllValues.length; i++) {
    if (interpAllValues[i] < dataMinVal) dataMinVal = interpAllValues[i];
  }

  // Build spatial index for fast neighbor queries (boundary checks).
  // This is separate from any index the algorithm builds internally.
  const spatialIndex = buildSpatialIndex(interpPoints);
  // Max proximity for interior hull cells
  const interiorMaxDist = bufferPx * 3;

  const fcr = algorithm.fullCanvasRender;
  const fullCanvas = typeof fcr === 'function' ? fcr(state) : !!fcr;

  for (let by = 0; by < canvasHeight; by += blockSize) {
    for (let bx = 0; bx < canvasWidth; bx += blockSize) {
      const cx = bx + blockSize / 2;
      const cy = by + blockSize / 2;

      let alpha = 1.0;
      let isOutsideHull = false;
      let nearestOutsideValue: number | null = null;
      let localMin = -Infinity;

      if (fullCanvas) {
        // No hull/proximity clipping — render every pixel.
      } else if (isDegenerate) {
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
          const nearbyIds = spatialIndex.within(cx, cy, interiorMaxDist);
          if (nearbyIds.length === 0) continue;

          let nearestDistSq = Infinity;
          let lMin = Infinity;
          for (let i = 0; i < nearbyIds.length; i++) {
            const pt = interpPoints[nearbyIds[i]];
            const dx = cx - pt.x;
            const dy = cy - pt.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < nearestDistSq) nearestDistSq = dSq;
            if (pt.value < lMin) lMin = pt.value;
          }
          const nearestDist = Math.sqrt(nearestDistSq);
          localMin = lMin;

          if (nearestDist > bufferPx) {
            alpha = 1 - (nearestDist - bufferPx) / (interiorMaxDist - bufferPx);
          }
        } else {
          isOutsideHull = true;
          const nearbyIds = spatialIndex.within(cx, cy, bufferPx);
          if (nearbyIds.length === 0) continue;

          let nearestDistSq = Infinity;
          let nearestIdx = nearbyIds[0];
          for (let i = 0; i < nearbyIds.length; i++) {
            const pt = points[nearbyIds[i]];
            const dx = cx - pt.x;
            const dy = cy - pt.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < nearestDistSq) {
              nearestDistSq = dSq;
              nearestIdx = nearbyIds[i];
            }
          }
          const nearestDist = Math.sqrt(nearestDistSq);
          alpha = 1 - nearestDist / bufferPx;
          nearestOutsideValue = interpPoints[nearestIdx].value;
        }
      }

      // Compute interpolated value
      let value: number;
      if (isOutsideHull) {
        const nearest = nearestOutsideValue!;
        value = dataMinVal + alpha * (nearest - dataMinVal);
      } else {
        value = algorithm.evaluate(cx, cy, state);
        if (localMin !== -Infinity) {
          value = Math.max(localMin, value);
        }
      }
      // Transform back from log space before normalization.
      if (logScale) value = Math.exp(value);

      // Store in value grid for click lookup.
      const gx = Math.floor(bx / blockSize);
      const gy = Math.floor(by / blockSize);
      valueGrid[gy * gridCols + gx] = value;

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

  return { imageData, valueGrid, gridCols };
}
