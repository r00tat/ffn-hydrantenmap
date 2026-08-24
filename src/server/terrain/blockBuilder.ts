import {
  BEV_TILE_PX,
  blockPixelCenter,
  sourcePixelIndex,
  type BlockRef,
} from '../../common/terrain/grid';
import { readTile, type BigTiffInfo, type FetchRange } from './bigtiff';

/**
 * Blöcke des Höhenmodells aus den internen Kacheln einer BEV-Quelldatei
 * zusammensetzen.
 *
 * `NaN` steht durchgehend für „keine Daten". Der Quellwert −9999 darf nirgends
 * als Höhe weiterlaufen: aus nodata = −9999 m oder 0 m würde im
 * Wasserstandsmodell eine Fläche, für die es überhaupt keine Messung gibt.
 */

/** Alles unterhalb dieser Schwelle ist der nodata-Wert der Quelle (−9999). */
const NODATA_THRESHOLD = -9000;

/** Liefert eine interne Quellkachel, oder `undefined`, wenn sie leer ist. */
export type TileReader = (index: number) => Promise<Float32Array | undefined>;

/**
 * Kachelleser mit Gedächtnis.
 *
 * Ein 1-km-Block berührt bis zu 5 × 5 = 25 interne Kacheln, und jede Pixelzeile
 * greift auf mehrere davon zu. Ohne Cache würde derselbe Range-Request
 * tausendfach wiederholt.
 */
export function memoTileReader(
  info: BigTiffInfo,
  fetchRange: FetchRange
): TileReader {
  const cache = new Map<number, Float32Array | undefined>();
  return async (index) => {
    if (!cache.has(index)) {
      cache.set(index, await readTile(info, index, fetchRange));
    }
    return cache.get(index);
  };
}

export interface BuildBlockOptions {
  block: BlockRef;
  info: BigTiffInfo;
  /** Injiziert, damit die Zuordnung ohne LZW und ohne Netz prüfbar ist. */
  readTileAt: TileReader;
  /**
   * Zielrasterweite in m. Muss der Quellrasterweite entsprechen — die gröbere
   * Stufe entsteht später über `decimate`, wo gemittelt wird.
   */
  resolutionM: number;
}

/**
 * Ein Block als `Float32Array` in Lesereihenfolge (Zeilen von Nord nach Süd).
 *
 * Gearbeitet wird **kachelweise, nicht pixelweise**: für jede berührte
 * Quellkachel wird ihr Überlappungsrechteck in einem engen Schleifenpaar
 * kopiert. Pixelweise mit einem `await` je Pixel wären es bei 1000 × 1000 px
 * eine Million Unterbrechungspunkte je Block und über 4.000 Blöcke hinweg
 * Milliarden — der Import würde nie fertig.
 */
export async function buildBlock({
  block,
  info,
  readTileAt,
  resolutionM,
}: BuildBlockOptions): Promise<Float32Array> {
  if (resolutionM !== info.pixelSizeM) {
    throw new Error(
      `buildBlock: Zielrasterweite ${resolutionM} m passt nicht zur Quelle ${info.pixelSizeM} m`
    );
  }

  const sizePx = Math.round(block.sizeM / resolutionM);
  const out = new Float32Array(sizePx * sizePx).fill(Number.NaN);

  // Quellpixelbereich des Blocks, ausgehend von der Mitte seines Pixels (0,0)
  // — der nordwestlichen Pixelmitte, nicht der Blockecke (siehe
  // `pixelInBlock`: das Gitter ist an der Südwestecke ausgerichtet).
  const first = sourcePixelIndex(
    blockPixelCenter(block, 0, 0, resolutionM),
    info
  );
  const colOffset = first.col;
  const rowOffset = first.row;

  const tileFirstCol = Math.floor(colOffset / BEV_TILE_PX);
  const tileLastCol = Math.floor((colOffset + sizePx - 1) / BEV_TILE_PX);
  const tileFirstRow = Math.floor(rowOffset / BEV_TILE_PX);
  const tileLastRow = Math.floor((rowOffset + sizePx - 1) / BEV_TILE_PX);

  for (let tileRow = tileFirstRow; tileRow <= tileLastRow; tileRow += 1) {
    if (tileRow < 0 || tileRow >= info.tileRows) continue;
    for (let tileCol = tileFirstCol; tileCol <= tileLastCol; tileCol += 1) {
      if (tileCol < 0 || tileCol >= info.tileCols) continue;

      const tile = await readTileAt(tileRow * info.tileCols + tileCol);
      if (!tile) continue;

      // Überlappung von Kachel und Block, in globalen Quellpixeln.
      const srcColFrom = Math.max(tileCol * BEV_TILE_PX, colOffset);
      const srcColTo = Math.min(
        (tileCol + 1) * BEV_TILE_PX - 1,
        colOffset + sizePx - 1,
        info.width - 1
      );
      const srcRowFrom = Math.max(tileRow * BEV_TILE_PX, rowOffset);
      const srcRowTo = Math.min(
        (tileRow + 1) * BEV_TILE_PX - 1,
        rowOffset + sizePx - 1,
        info.height - 1
      );

      for (let srcRow = srcRowFrom; srcRow <= srcRowTo; srcRow += 1) {
        const tileRowBase = (srcRow - tileRow * BEV_TILE_PX) * info.tileWidth;
        const outRowBase = (srcRow - rowOffset) * sizePx;
        for (let srcCol = srcColFrom; srcCol <= srcColTo; srcCol += 1) {
          const value = tile[tileRowBase + (srcCol - tileCol * BEV_TILE_PX)];
          if (value !== undefined && value > NODATA_THRESHOLD) {
            out[outRowBase + (srcCol - colOffset)] = value;
          }
        }
      }
    }
  }

  return out;
}

/**
 * Dezimierung auf eine gröbere Stufe durch Mittelwertbildung.
 *
 * Eine Ausgabezelle, die **irgendeine** nodata-Eingabezelle enthält, wird
 * nodata. Ein Mittelwert über den Rand der Datenabdeckung wäre eine erfundene
 * Höhe, und im Wasserstandsmodell würde daraus eine erfundene Fläche.
 *
 * Gemittelt und nicht gestichprobt, damit das Messrauschen der Laserdaten mit
 * der Gruppengröße sinkt.
 */
export function decimate(
  source: Float32Array,
  sourcePx: number,
  factor: number
): Float32Array {
  const targetPx = Math.floor(sourcePx / factor);
  const out = new Float32Array(targetPx * targetPx);
  const cells = factor * factor;

  for (let row = 0; row < targetPx; row += 1) {
    for (let col = 0; col < targetPx; col += 1) {
      let sum = 0;
      let missing = false;
      for (let dy = 0; dy < factor && !missing; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const value =
            source[(row * factor + dy) * sourcePx + col * factor + dx];
          if (value === undefined || Number.isNaN(value)) {
            missing = true;
            break;
          }
          sum += value;
        }
      }
      out[row * targetPx + col] = missing ? Number.NaN : sum / cells;
    }
  }

  return out;
}
