import type { BlockStore } from './blockStore';
import { decodeHeight } from './encoding';
import { blocksForBounds, type LaeaBounds } from './grid';
import { wgs84ToLaea } from './projection';
import {
  TERRAIN_LEVEL_ORDER,
  terrainLevel,
  type TerrainIndex,
  type TerrainLevel,
} from './terrainIndexTypes';
import type { TerrainBoundsLatLng } from './terrainTypes';

/**
 * Das zusammengesetzte Höhengitter über einen Kartenausschnitt.
 *
 * Gemeinsame Grundlage von Höhenlinien und 3D-Mesh. Blockweise gerechnet wäre
 * jede Höhenlinie an jeder Blockgrenze in eine eigene zerlegt, und das Mesh
 * hätte an denselben Kanten eine Naht.
 */

/**
 * Zellbudget je Abfrage.
 *
 * 2,5 Mio. Zellen sind ein Gitter von etwa 1580 × 1580. In der Detailstufe
 * (1 m) deckt das rund 1,6 km ab, in der Übersicht (10 m) rund 16 km. Darüber
 * wird die gröbere Stufe genommen; reicht auch die nicht, gibt es kein
 * Ergebnis, statt den Browser für eine Minute anzuhalten.
 */
export const MAX_CONTOUR_CELLS = 2_500_000;

/**
 * Die LAEA-Hülle eines Lat/Lon-Rechtecks.
 *
 * Neben den vier Ecken werden die Kantenmitten geprüft: LAEA ist nicht
 * achsparallel zu Lat/Lon, die Kanten des Rechtecks wölben sich also nach
 * außen. Nur über die Ecken gerechnet fehlte am Rand ein Streifen.
 */
export function laeaHull(bounds: TerrainBoundsLatLng): LaeaBounds {
  const { south, west, north, east } = bounds;
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;
  const samples: [number, number][] = [
    [south, west],
    [south, east],
    [north, west],
    [north, east],
    [south, midLng],
    [north, midLng],
    [midLat, west],
    [midLat, east],
  ];
  const points = samples.map((position) => wgs84ToLaea(position));
  return {
    eMin: Math.min(...points.map((p) => p.e)),
    eMax: Math.max(...points.map((p) => p.e)),
    nMin: Math.min(...points.map((p) => p.n)),
    nMax: Math.max(...points.map((p) => p.n)),
  };
}

/** Zellenzahl, die eine Stufe über diesem Ausschnitt bräuchte. */
const cellCount = (level: TerrainLevel, hull: LaeaBounds): number => {
  const cols =
    Math.floor(hull.eMax / level.resolutionM) -
    Math.ceil(hull.eMin / level.resolutionM) +
    1;
  const rows =
    Math.floor(hull.nMax / level.resolutionM) -
    Math.ceil(hull.nMin / level.resolutionM) +
    1;
  return cols > 0 && rows > 0 ? cols * rows : 0;
};

/** Die feinste Stufe, die noch ins Zellbudget passt. */
export function chooseContourLevel(
  index: TerrainIndex,
  hull: LaeaBounds
): TerrainLevel | undefined {
  for (const id of TERRAIN_LEVEL_ORDER) {
    const level = terrainLevel(index, id);
    if (!level) continue;
    const cells = cellCount(level, hull);
    if (cells > 0 && cells <= MAX_CONTOUR_CELLS) return level;
  }
  return undefined;
}

export interface Mosaic {
  /** Höhen in m, `NaN` für nodata. Zeile 0 ist die nördlichste. */
  values: Float32Array;
  cols: number;
  rows: number;
  /** Globaler Pixelindex der westlichsten Spalte (`e = index * resolutionM`). */
  colMin: number;
  /** Globaler Pixelindex der nördlichsten Zeile. */
  rowMax: number;
  level: TerrainLevel;
}

/** Die Blöcke des Ausschnitts in ein durchgehendes Gitter kopieren. */
export async function buildMosaic(
  store: BlockStore,
  level: TerrainLevel,
  hull: LaeaBounds
): Promise<Mosaic | undefined> {
  const res = level.resolutionM;
  const colMin = Math.ceil(hull.eMin / res);
  const colMax = Math.floor(hull.eMax / res);
  const rowMin = Math.ceil(hull.nMin / res);
  const rowMax = Math.floor(hull.nMax / res);
  const cols = colMax - colMin + 1;
  const rows = rowMax - rowMin + 1;
  if (cols <= 0 || rows <= 0) return undefined;

  const values = new Float32Array(cols * rows).fill(Number.NaN);

  // `+ res` beim oberen Rand: `blocksForBounds` schließt die Obergrenze aus,
  // die nördlichste bzw. östlichste Pixelmitte kann aber genau auf einer
  // Blockkante liegen und gehört dann in den nächsten Block.
  const blocks = blocksForBounds(
    {
      eMin: colMin * res,
      eMax: colMax * res + res,
      nMin: rowMin * res,
      nMax: rowMax * res + res,
    },
    level.blockSizeM
  );

  for (const ref of blocks) {
    const block = await store.block(level.id, ref);
    if (!block) continue;

    // Globaler Pixelindex der nordwestlichen Pixelmitte des Blocks.
    const blockColMin = ref.e / res;
    const blockRowMax = (ref.n + ref.sizeM - res) / res;

    const colOffset = blockColMin - colMin;
    const rowOffset = rowMax - blockRowMax;

    const cStart = Math.max(0, -colOffset);
    const cEnd = Math.min(block.sizePx - 1, cols - 1 - colOffset);
    const rStart = Math.max(0, -rowOffset);
    const rEnd = Math.min(block.sizePx - 1, rows - 1 - rowOffset);

    for (let r = rStart; r <= rEnd; r += 1) {
      const target = (rowOffset + r) * cols + colOffset;
      const source = r * block.sizePx;
      for (let c = cStart; c <= cEnd; c += 1) {
        const height = decodeHeight(block.heights[source + c], level);
        values[target + c] = height === undefined ? Number.NaN : height;
      }
    }
  }

  return { values, cols, rows, colMin, rowMax, level };
}
