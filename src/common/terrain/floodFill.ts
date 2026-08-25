import type { LatLngPosition } from '../geo';
import type { TerrainBlock } from './blockStore';
import { decodeHeight } from './encoding';
import {
  blockForPoint,
  blockId,
  blockPixelCenter,
  pixelInBlock,
  type BlockRef,
  type LaeaBounds,
} from './grid';
import { wgs84ToLaea } from './projection';
import {
  terrainLevel,
  type TerrainIndex,
  type TerrainLevel,
  type TerrainLevelId,
} from './terrainIndexTypes';

/**
 * Statische Flutfüllung („Badewanne") auf dem Höhenmodell.
 *
 * Geflutet ist eine Zelle, wenn ihre Höhe **kleiner oder gleich** dem
 * Wasserstand ist **und** sie über geflutete Nachbarn mit dem Saatpunkt
 * verbunden ist. Kein Zeitverlauf, keine Strömung, keine Massenerhaltung — das
 * ist ausdrücklich Absicht und in `docs/wasserstandsmodell.md` begründet.
 *
 * Der Arbeitsvorrat sind **Blöcke**, nicht Zellen: eine Suche über zellweise
 * `await`-Aufrufe auf den Blockspeicher wäre eine Netzanfrage je Zelle. Je
 * Block liegt ein Bitfeld der gefluteten Zellen (1 Bit je Zelle, 125 KB bei
 * 1000 × 1000) und eine Menge offener Eintrittszellen; erreicht die Suche eine
 * Blockkante, wird die gegenüberliegende Zelle im Nachbarblock vermerkt. Ein
 * Block kommt mehrfach dran, wenn das Wasser ihn später von einer anderen
 * Seite erreicht — sein Bitfeld bleibt, und nur **neue** Eintrittszellen lösen
 * einen weiteren Durchlauf aus. Das terminiert, weil je Durchlauf mindestens
 * eine neue Zelle geflutet wird.
 */

/**
 * **4er-Nachbarschaft, nicht 8er.** Mit 8er sickert Wasser diagonal durch
 * einen ein Meter breiten Damm — und genau diese Objekte (Dämme,
 * Straßendämme, Mauern) sind der Grund, überhaupt mit 1 m Raster zu rechnen.
 */
const NEIGHBOURS_4 = true;

/**
 * Budget in **verschiedenen** Blöcken, nicht in Ladevorgängen.
 *
 * Ein Block, der zum zweiten Mal dran ist, kostet nichts (LRU), aber ein
 * neuer kostet eine Kachel. Gezählt wird deshalb, was Fläche und Datenmenge
 * bedeutet: 120 Detailblöcke sind 120 km² und rund 40 MB, 25
 * Übersichtsblöcke sind 2.500 km² und rund 10 MB.
 */
export const FLOOD_BUDGET_BLOCKS: Record<TerrainLevelId, number> = {
  detail: 120,
  overview: 25,
};

export class FloodAborted extends Error {
  constructor() {
    super('Flutfüllung abgebrochen');
    this.name = 'FloodAborted';
  }
}

export type FloodReason =
  | 'noIndex'
  | 'noLevel'
  | 'seedOutside'
  | 'seedTileMissing'
  | 'seedNoData'
  | 'seedAboveLevel';

export interface FloodTile {
  ref: BlockRef;
  /** MSB-first, Index `row * blockPx + col`, Zeilen von Nord nach Süd. */
  bits: Uint8Array;
  cells: number;
}

export interface FloodResult {
  levelId: TerrainLevelId;
  resolutionM: number;
  blockPx: number;
  blocks: Map<string, FloodTile>;
  cells: number;
  areaM2: number;
  maxDepthM: number;
  /** Hülle der gefluteten Zellmitten in LAEA, `undefined` bei leerer Fläche. */
  bounds?: LaeaBounds;
  longestAxisM: number;
  truncated: 'none' | 'budget' | 'radius';
  /** Kacheln, die es laut Index gibt, die aber nicht geladen werden konnten. */
  missingBlocks: number;
  /** Kacheln jenseits der Modellabdeckung — der Rand des Modells. */
  edgeBlocks: number;
  reason?: FloodReason;
}

export interface FloodOptions {
  budgetBlocks?: number;
  /**
   * Umkreis um den Saatpunkt in m, über den hinaus nicht geflutet wird.
   *
   * `0` oder nicht gesetzt heißt unbegrenzt. Gebraucht wird er, weil eine
   * Badewanne über ein Seebecken hinweg weiterläuft: Der Neusiedler See liegt
   * unter jedem Hochwasserstand der Zuflüsse, und die Fläche wächst dann über
   * den Bereich hinaus, um den es geht. Ein Umkreis ist die Angabe, die im
   * Einsatz zur Hand ist — anders als ein Rechenbudget in Kacheln.
   */
  maxRadiusM?: number;
  onProgress?: (progress: { blocks: number; cells: number }) => void;
  abort?: () => boolean;
}

export interface FloodSource {
  index(): Promise<TerrainIndex | undefined>;
  block(
    levelId: TerrainLevelId,
    block: BlockRef
  ): Promise<TerrainBlock | undefined>;
  available(level: TerrainLevel, block: BlockRef): boolean;
}

const isSet = (bits: Uint8Array, cell: number): boolean =>
  (bits[cell >> 3] & (0x80 >> (cell & 7))) !== 0;

const setBit = (bits: Uint8Array, cell: number): void => {
  bits[cell >> 3] |= 0x80 >> (cell & 7);
};

const empty = (
  levelId: TerrainLevelId,
  resolutionM: number,
  blockPx: number,
  reason?: FloodReason
): FloodResult => ({
  levelId,
  resolutionM,
  blockPx,
  blocks: new Map(),
  cells: 0,
  areaM2: 0,
  maxDepthM: 0,
  longestAxisM: 0,
  truncated: 'none',
  missingBlocks: 0,
  edgeBlocks: 0,
  reason,
});

export async function floodFill(
  source: FloodSource,
  seed: LatLngPosition,
  waterLevelM: number,
  levelId: TerrainLevelId,
  options: FloodOptions = {}
): Promise<FloodResult> {
  const index = await source.index();
  if (!index) return empty(levelId, 0, 0, 'noIndex');
  const level = terrainLevel(index, levelId);
  if (!level) return empty(levelId, 0, 0, 'noLevel');

  const res = level.resolutionM;
  const px = level.blockPx;
  const budget = options.budgetBlocks ?? FLOOD_BUDGET_BLOCKS[levelId];
  const radiusM =
    options.maxRadiusM && options.maxRadiusM > 0 ? options.maxRadiusM : 0;
  const radiusSq = radiusM * radiusM;

  const point = wgs84ToLaea(seed);
  const seedRef = blockForPoint(point, level.blockSizeM);
  const seedBlock = await source.block(levelId, seedRef);
  if (!seedBlock) {
    return empty(
      levelId,
      res,
      px,
      source.available(level, seedRef) ? 'seedTileMissing' : 'seedOutside'
    );
  }

  const { col, row } = pixelInBlock(point, seedRef, res);
  const seedCol = Math.round(col);
  const seedRow = Math.round(row);
  if (seedCol < 0 || seedRow < 0 || seedCol >= px || seedRow >= px) {
    return empty(levelId, res, px, 'seedOutside');
  }
  const seedHeight = decodeHeight(
    seedBlock.heights[seedRow * px + seedCol],
    level
  );
  if (seedHeight === undefined) return empty(levelId, res, px, 'seedNoData');
  if (seedHeight > waterLevelM) {
    return empty(levelId, res, px, 'seedAboveLevel');
  }

  const tiles = new Map<string, FloodTile>();
  const entries = new Map<string, number[]>();
  const refs = new Map<string, BlockRef>();
  const queued = new Set<string>();
  const queue: string[] = [];
  const reported = new Set<string>();

  let cells = 0;
  let maxDepth = 0;
  let missingBlocks = 0;
  let edgeBlocks = 0;
  let truncated: 'none' | 'budget' | 'radius' = 'none';
  let eMin = Number.POSITIVE_INFINITY;
  let eMax = Number.NEGATIVE_INFINITY;
  let nMin = Number.POSITIVE_INFINITY;
  let nMax = Number.NEGATIVE_INFINITY;

  /**
   * Ob ein Block vollständig jenseits des Umkreises liegt.
   *
   * Geprüft wird der **nächstgelegene** Punkt des Blockrechtecks: liegt schon
   * der außerhalb, kann keine Zelle des Blocks innerhalb liegen.
   */
  const blockOutsideRadius = (ref: BlockRef): boolean => {
    const nearestE = Math.min(Math.max(point.e, ref.e), ref.e + ref.sizeM);
    const nearestN = Math.min(Math.max(point.n, ref.n), ref.n + ref.sizeM);
    const de = nearestE - point.e;
    const dn = nearestN - point.n;
    return de * de + dn * dn > radiusSq;
  };

  const tileFor = (ref: BlockRef): FloodTile => {
    const key = blockId(ref);
    let tile = tiles.get(key);
    if (!tile) {
      tile = { ref, bits: new Uint8Array(Math.ceil((px * px) / 8)), cells: 0 };
      tiles.set(key, tile);
      refs.set(key, ref);
    }
    return tile;
  };

  const enqueue = (ref: BlockRef, cell: number): void => {
    const key = blockId(ref);
    const tile = tiles.get(key);
    if (tile && isSet(tile.bits, cell)) return;
    const open = entries.get(key);
    if (open) open.push(cell);
    else entries.set(key, [cell]);
    refs.set(key, ref);
    if (!queued.has(key)) {
      queued.add(key);
      queue.push(key);
    }
  };

  enqueue(seedRef, seedRow * px + seedCol);

  while (queue.length > 0) {
    if (options.abort?.()) throw new FloodAborted();

    const key = queue.shift() as string;
    queued.delete(key);
    const open = entries.get(key) ?? [];
    entries.delete(key);
    if (open.length === 0) continue;

    const ref = refs.get(key) as BlockRef;

    // Ein Block, der komplett außerhalb des Umkreises liegt, wird nicht
    // geladen. Das ist der eigentliche Gewinn des Umkreises: nicht nur eine
    // kleinere Fläche, sondern weniger Kacheln.
    if (radiusM > 0 && blockOutsideRadius(ref)) {
      truncated = truncated === 'budget' ? 'budget' : 'radius';
      continue;
    }

    // Budget gegen **neue** Blöcke: ein zweiter Durchlauf über einen bekannten
    // Block kostet keine Kachel.
    if (!tiles.has(key) && tiles.size >= budget) {
      truncated = 'budget';
      continue;
    }

    const block = await source.block(levelId, ref);
    if (!block) {
      if (!reported.has(key)) {
        reported.add(key);
        if (source.available(level, ref)) missingBlocks += 1;
        else edgeBlocks += 1;
      }
      continue;
    }

    const tile = tileFor(ref);
    const stack: number[] = open.filter((cell) => !isSet(tile.bits, cell));

    while (stack.length > 0) {
      const cell = stack.pop() as number;
      if (isSet(tile.bits, cell)) continue;
      const height = decodeHeight(block.heights[cell], level);
      if (height === undefined || height > waterLevelM) continue;

      const c = cell % px;
      const r = (cell - c) / px;
      const centre = blockPixelCenter(ref, c, r, res);

      // Der Umkreis wird **vor** dem Fluten geprüft: eine Zelle jenseits davon
      // wird nicht geflutet und breitet sich auch nicht weiter aus.
      if (radiusM > 0) {
        const de = centre.e - point.e;
        const dn = centre.n - point.n;
        if (de * de + dn * dn > radiusSq) {
          truncated = truncated === 'budget' ? 'budget' : 'radius';
          continue;
        }
      }

      setBit(tile.bits, cell);
      tile.cells += 1;
      cells += 1;
      const depth = waterLevelM - height;
      if (depth > maxDepth) maxDepth = depth;

      if (centre.e < eMin) eMin = centre.e;
      if (centre.e > eMax) eMax = centre.e;
      if (centre.n < nMin) nMin = centre.n;
      if (centre.n > nMax) nMax = centre.n;

      // West
      if (c > 0) stack.push(cell - 1);
      else enqueue({ ...ref, e: ref.e - ref.sizeM }, r * px + (px - 1));
      // Ost
      if (c < px - 1) stack.push(cell + 1);
      else enqueue({ ...ref, e: ref.e + ref.sizeM }, r * px + 0);
      // Nord — Zeile 0 ist die nördlichste, die Blockkante `n` die untere.
      if (r > 0) stack.push(cell - px);
      else enqueue({ ...ref, n: ref.n + ref.sizeM }, (px - 1) * px + c);
      // Süd
      if (r < px - 1) stack.push(cell + px);
      else enqueue({ ...ref, n: ref.n - ref.sizeM }, 0 * px + c);
    }

    options.onProgress?.({ blocks: tiles.size, cells });
  }

  const bounds = cells > 0 ? { eMin, eMax, nMin, nMax } : undefined;

  return {
    levelId,
    resolutionM: res,
    blockPx: px,
    blocks: tiles,
    cells,
    areaM2: cells * res * res,
    maxDepthM: maxDepth,
    bounds,
    longestAxisM: bounds
      ? Math.max(bounds.eMax - bounds.eMin, bounds.nMax - bounds.nMin) + res
      : 0,
    truncated,
    missingBlocks,
    edgeBlocks,
  };
}

// `NEIGHBOURS_4` steht als Marke im Code, damit eine Umstellung auf 8er nicht
// als Einzeiler durchgeht: sie wäre eine fachliche Änderung mit Folgen für
// jede ausgewiesene Fläche.
void NEIGHBOURS_4;
