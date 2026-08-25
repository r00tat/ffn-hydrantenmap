import simplify from 'simplify-js';
import type { LatLngPosition } from '../geo';
import type { TerrainBlock } from './blockStore';
import {
  chainSegments,
  marchingSquares,
  type ContourPoint,
  type ContourSegment,
} from './contour';
import { decodeHeight } from './encoding';
import { blockId, type BlockRef } from './grid';
import type { FloodResult, FloodSource, FloodTile } from './floodFill';
import { laeaToWgs84 } from './projection';
import { terrainLevel } from './terrainIndexTypes';

/**
 * Aus den Bitfeldern der Flutfüllung werden Polygonringe je Tiefenstufe.
 *
 * Konturiert wird das **Tiefenfeld**, nicht die Höhe:
 *
 * ```
 * d = h − Geländehöhe                     für geflutete Zellen
 * d = min(h − Geländehöhe, −0,01 m)       für alle anderen
 * ```
 *
 * Die zweite Zeile ist der Kern. Am **echten Ufer** wird `h − Geländehöhe` von
 * selbst negativ, und die Interpolation von Marching Squares legt die Grenze
 * auf den Geländeschnitt — dorthin, wo das Wasser wirklich endet. An einer
 * **Sperre** — tiefes, aber unverbundenes Gelände hinter einem Damm — wäre `d`
 * positiv, und die Grenze wanderte in die trockene Seite hinein; der Deckel
 * bei −0,01 m legt sie stattdessen auf die Zellkante.
 *
 * Gerechnet wird **blockweise mit einem Pixel Überlappung** und in **globalen**
 * Zellkoordinaten. Ein Mosaik über die ganze Fläche wäre bei 120 km² und 1 m
 * Raster eine halbe Milliarde Zellen; so ist immer nur ein Fenster von
 * (blockPx+1)² im Speicher. Weil die Segmente in globalen Koordinaten
 * entstehen, treffen sich die Endpunkte an einer Blockkante exakt, und
 * `chainSegments` verkettet über die Kante hinweg — genau wie das
 * zusammengesetzte Gitter bei den Höhenlinien, nur ohne das Gitter.
 *
 * Der Preis: ein Block wird bis zu viermal geladen (für sich und als Nachbar
 * von drei anderen). Der LRU des Blockspeichers und der Cache des Service
 * Workers fangen das ab; sichtbar ist es nur an der Laufzeit, nicht am
 * Ergebnis.
 */

/** Die Schwellen, an denen im Einsatz Entscheidungen hängen. */
export const BAND_DEPTHS_M = [0, 0.1, 0.3, 0.7, 1.5];

/** Kleinste Insel, die noch gezeichnet wird. Darunter sind es Gebäudeecken. */
export const MIN_RING_AREA_M2 = 100;

/** Punktbudget über alle Bänder — rund 35 KB kodiert. */
export const MAX_BAND_POINTS = 8000;

/** Ausdünnung in Gitterzellen, aufsteigend bis das Budget passt. */
export const SIMPLIFY_STEPS_CELLS = [0.5, 1, 2, 4, 8];

/** Trockene Zellen werden auf diesen Wert gedeckelt. Siehe oben. */
const DRY_CAP_M = -0.01;

export interface FloodBand {
  tiefeM: number;
  ringe: LatLngPosition[][];
}

export interface FloodBandsResult {
  baender: FloodBand[];
  /** Verwendete Ausdünnungstoleranz in m. */
  toleranzM: number;
  inselnVerworfen: number;
  punkte: number;
}

export interface FloodBandsOptions {
  maxPoints?: number;
  onProgress?: (progress: { blocks: number; total: number }) => void;
  abort?: () => boolean;
}

/**
 * Punkt in einer Menge von Ringen, **Even-odd**.
 *
 * Dieselbe Regel, mit der die Karte die Fläche füllt (`fillRule: 'evenodd'`).
 * Eine andere Regel hier hieße: die Zahl im Sandsackrechner gehört zu einer
 * anderen Fläche als die, die man auf der Karte sieht.
 */
export function pointInRings(
  point: LatLngPosition,
  rings: LatLngPosition[][]
): boolean {
  const [lat, lng] = point;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [latI, lngI] = ring[i];
      const [latJ, lngJ] = ring[j];
      if (
        latI > lat !== latJ > lat &&
        lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Fläche eines Rings in Zellen (Gaußsche Trapezformel), vorzeichenlos.
 *
 * Verschoben auf den ersten Punkt: die globalen Zellindizes liegen bei
 * Millionen, und die Produkte darüber sind 1e13 groß. Ohne die Verschiebung
 * bliebe von einer Fläche von 100 Zellen nach der Differenzbildung nur noch
 * Rauschen.
 */
const ringAreaCells = (points: ContourPoint[]): number => {
  if (points.length < 3) return 0;
  const col0 = points[0].col;
  const row0 = points[0].row;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    sum +=
      (points[j].col - col0) * (points[i].row - row0) -
      (points[i].col - col0) * (points[j].row - row0);
  }
  return Math.abs(sum) / 2;
};

interface DepthWindow {
  /** (px+1)² Tiefenwerte, `NaN` für nodata. Zeile 0 ist die nördlichste. */
  depth: Float32Array;
  size: number;
  /** Globaler Zellindex der nordwestlichen Ecke des Fensters. */
  col0: number;
  row0: number;
}

/** Globaler Zellindex: `col = e / res`, `row = −n / res`. */
const globalCol = (ref: BlockRef, res: number, col: number): number =>
  ref.e / res + col;
const globalRow = (
  ref: BlockRef,
  res: number,
  px: number,
  row: number
): number => -(ref.n / res + px - 1) + row;

export async function floodBands(
  source: FloodSource,
  fill: FloodResult,
  waterLevelM: number,
  options: FloodBandsOptions = {}
): Promise<FloodBandsResult> {
  const empty: FloodBandsResult = {
    baender: BAND_DEPTHS_M.map((tiefeM) => ({ tiefeM, ringe: [] })),
    toleranzM: SIMPLIFY_STEPS_CELLS[0] * fill.resolutionM,
    inselnVerworfen: 0,
    punkte: 0,
  };
  if (fill.cells === 0) return empty;

  const index = await source.index();
  const level = index ? terrainLevel(index, fill.levelId) : undefined;
  if (!level) return empty;

  const res = level.resolutionM;
  const px = level.blockPx;
  const maxPoints = options.maxPoints ?? MAX_BAND_POINTS;

  /**
   * Tiefe an einer Zelle eines geladenen Blocks, nach der Regel oben.
   *
   * `NaN` steht für „keine Daten" und wird von Marching Squares als
   * `undefined` behandelt — die Zelle fällt aus der Kontur.
   */
  const depthOf = (
    block: TerrainBlock | undefined,
    tile: FloodTile | undefined,
    col: number,
    row: number
  ): number => {
    if (!block) return Number.NaN;
    const cell = row * px + col;
    const height = decodeHeight(block.heights[cell], level);
    if (height === undefined) return Number.NaN;
    const raw = waterLevelM - height;
    const flooded =
      tile !== undefined &&
      (tile.bits[cell >> 3] & (0x80 >> (cell & 7))) !== 0;
    return flooded ? raw : Math.min(raw, DRY_CAP_M);
  };

  /**
   * Fenster (px+1)² über einem Block, mit einem Pixel Überlappung nach Ost
   * und Süd.
   *
   * Die vier beteiligten Blöcke werden **einmal** geholt und dann direkt
   * indiziert. Ein Nachschlagen je Zelle wäre bei 1000 × 1000 eine Million
   * Suchen je Block.
   */
  const buildWindow = async (
    tile: FloodTile
  ): Promise<DepthWindow | undefined> => {
    const ref = tile.ref;
    const eastRef: BlockRef = { ...ref, e: ref.e + ref.sizeM };
    const southRef: BlockRef = { ...ref, n: ref.n - ref.sizeM };
    const southEastRef: BlockRef = {
      e: ref.e + ref.sizeM,
      n: ref.n - ref.sizeM,
      sizeM: ref.sizeM,
    };

    const [self, east, south, southEast] = await Promise.all([
      source.block(fill.levelId, ref),
      source.block(fill.levelId, eastRef),
      source.block(fill.levelId, southRef),
      source.block(fill.levelId, southEastRef),
    ]);
    if (!self) return undefined;

    const selfTile = fill.blocks.get(blockId(ref));
    const eastTile = fill.blocks.get(blockId(eastRef));
    const southTile = fill.blocks.get(blockId(southRef));
    const southEastTile = fill.blocks.get(blockId(southEastRef));

    const size = px + 1;
    const depth = new Float32Array(size * size);
    for (let row = 0; row < size; row += 1) {
      const onSouth = row === px;
      for (let col = 0; col < size; col += 1) {
        const onEast = col === px;
        const block = onSouth ? (onEast ? southEast : south) : onEast ? east : self;
        const inTile = onSouth
          ? onEast
            ? southEastTile
            : southTile
          : onEast
            ? eastTile
            : selfTile;
        depth[row * size + col] = depthOf(
          block,
          inTile,
          onEast ? 0 : col,
          onSouth ? 0 : row
        );
      }
    }

    return {
      depth,
      size,
      col0: globalCol(ref, res, 0),
      row0: globalRow(ref, res, px, 0),
    };
  };

  // Segmente je Schwelle, in globalen Zellkoordinaten.
  const segments = new Map<number, ContourSegment[]>();
  for (const depth of BAND_DEPTHS_M) segments.set(depth, []);

  const tiles = [...fill.blocks.values()];
  let done = 0;
  for (const tile of tiles) {
    if (options.abort?.()) return empty;
    const window = await buildWindow(tile);
    if (window) {
      const grid = (row: number, col: number): number | undefined => {
        const value = window.depth[row * window.size + col];
        return Number.isNaN(value) ? undefined : value;
      };
      for (const depth of BAND_DEPTHS_M) {
        const found = marchingSquares(grid, window.size, window.size, depth);
        const target = segments.get(depth) as ContourSegment[];
        for (const segment of found) {
          target.push({
            from: {
              col: segment.from.col + window.col0,
              row: segment.from.row + window.row0,
            },
            to: {
              col: segment.to.col + window.col0,
              row: segment.to.row + window.row0,
            },
          });
        }
      }
    }
    done += 1;
    options.onProgress?.({ blocks: done, total: tiles.length });
  }

  // Ringe je Schwelle, ausgedünnt bis das Punktbudget passt.
  let result: FloodBandsResult | undefined;

  for (const tolerance of SIMPLIFY_STEPS_CELLS) {
    let dropped = 0;
    let points = 0;
    const baender: FloodBand[] = [];

    for (const depth of BAND_DEPTHS_M) {
      const chains = chainSegments(segments.get(depth) as ContourSegment[]);
      const ringe: LatLngPosition[][] = [];
      for (const chain of chains) {
        // Offene Züge entstehen nur am Rand des Modells oder am Budget — beides
        // ist schon als „Fläche möglicherweise größer" gemeldet. Geschlossen
        // werden sie durch Verbinden der Enden; ein offener Zug wäre als
        // Fläche nicht zeichenbar.
        const closedPoints = chain.closed
          ? chain.points
          : [...chain.points, chain.points[0]];
        if (ringAreaCells(closedPoints) * res * res < MIN_RING_AREA_M2) {
          dropped += 1;
          continue;
        }
        const thinned = simplify(
          closedPoints.map((p) => ({ x: p.col, y: p.row })),
          tolerance,
          true
        );
        if (thinned.length < 3) {
          dropped += 1;
          continue;
        }
        const ring = thinned.map(({ x, y }) =>
          laeaToWgs84({ e: x * res, n: -y * res })
        );
        // Nach der Ausdünnung erneut schließen: `simplify` kennt keine Ringe.
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
        ringe.push(ring);
        points += ring.length;
      }
      baender.push({ tiefeM: depth, ringe });
    }

    result = {
      baender,
      toleranzM: tolerance * res,
      inselnVerworfen: dropped,
      punkte: points,
    };
    if (points <= maxPoints) break;
  }

  return result ?? empty;
}
