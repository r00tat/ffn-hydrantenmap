import simplify from 'simplify-js';
import type { BlockStore } from './blockStore';
import {
  chainSegments,
  contourThresholds,
  marchingSquares,
  type ContourPoint,
} from './contour';
import { laeaToWgs84 } from './projection';
import { buildMosaic, chooseContourLevel, laeaHull } from './terrainMosaic';
import type {
  ContourLine,
  ContourResult,
  TerrainBoundsLatLng,
} from './terrainTypes';

/**
 * Höhenlinien für einen Kartenausschnitt.
 *
 * Gerechnet wird auf einem **zusammengesetzten** Gitter über den ganzen
 * Ausschnitt, nicht blockweise: eine Höhenlinie, die über eine Blockgrenze
 * läuft, wäre sonst in zwei Linien zerlegt, und jede Blockkante trüge einen
 * Knick aus zwei aneinanderstoßenden Endpunkten.
 */

/** Ausdünnung in Gitterzellen. Ein halber Pixel ist unter der Zeichengenauigkeit. */
const SIMPLIFY_TOLERANCE_PX = 0.5;

export async function terrainContours(
  store: BlockStore,
  bounds: TerrainBoundsLatLng,
  equidistanceM: number
): Promise<ContourResult> {
  const index = await store.index();
  if (!index) return { lines: [] };

  const hull = laeaHull(bounds);
  const level = chooseContourLevel(index, hull);
  if (!level) return { lines: [] };

  const found: ContourResult = {
    lines: [],
    level: level.id,
    resolutionM: level.resolutionM,
  };

  const mosaic = await buildMosaic(store, level, hull);
  if (!mosaic) return found;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of mosaic.values) {
    if (Number.isNaN(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return found;
  found.minM = min;
  found.maxM = max;

  const heights = (row: number, col: number): number | undefined => {
    const value = mosaic.values[row * mosaic.cols + col];
    return Number.isNaN(value) ? undefined : value;
  };

  const res = level.resolutionM;
  const toLatLng = (point: ContourPoint) =>
    laeaToWgs84({
      e: (mosaic.colMin + point.col) * res,
      n: (mosaic.rowMax - point.row) * res,
    });

  const lines: ContourLine[] = found.lines;
  for (const threshold of contourThresholds(min, max, equidistanceM)) {
    const chains = chainSegments(
      marchingSquares(heights, mosaic.cols, mosaic.rows, threshold)
    );
    for (const chain of chains) {
      // Ausgedünnt wird in Gitterzellen, vor der Projektion: dort ist die
      // Toleranz in einer Einheit, die etwas bedeutet.
      const thinned = simplify(
        chain.points.map((point) => ({ x: point.col, y: point.row })),
        SIMPLIFY_TOLERANCE_PX,
        true
      );
      if (thinned.length < 2) continue;
      lines.push({
        heightM: threshold,
        points: thinned.map((point) => toLatLng({ col: point.x, row: point.y })),
        closed: chain.closed,
      });
    }
  }
  return found;
}
