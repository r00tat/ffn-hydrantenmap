import type { LatLngPosition } from '../geo';
import { wgs84ToLaea, type LaeaPoint } from './projection';

/**
 * Das Blockgitter des Höhenmodells in EPSG:3035.
 *
 * Die Namen folgen der Konvention der BEV-Quelldateien
 * (`CRS3035RES1000mN2782000E4834000`), damit die Herkunft eines Blocks ohne
 * Umrechnung ablesbar bleibt.
 *
 * **Diese Datei nutzen Import und Client gemeinsam.** Läuft die Blockmathematik
 * der beiden Seiten auseinander, liest der Client stillschweigend die falschen
 * Höhen — ein Fehler, der auf der Karte plausibel aussieht.
 */

export interface BlockRef {
  /** Ostwert der linken Blockkante in m. */
  e: number;
  /** Nordwert der **unteren** Blockkante in m. */
  n: number;
  /** Kantenlänge des Blocks in m. */
  sizeM: number;
}

/** `CRS3035RES1000mN2782000E4834000` */
export const blockId = ({ e, n, sizeM }: BlockRef): string =>
  `CRS3035RES${sizeM}mN${n}E${e}`;

const ID_PATTERN = /^CRS3035RES(\d+)mN(\d+)E(\d+)$/;

export function parseBlockId(id: string): BlockRef | undefined {
  const match = ID_PATTERN.exec(id);
  if (!match) return undefined;
  return { sizeM: Number(match[1]), n: Number(match[2]), e: Number(match[3]) };
}

/** Der Block, in dem ein LAEA-Punkt liegt. */
export const blockForPoint = (
  { e, n }: LaeaPoint,
  sizeM: number
): BlockRef => ({
  e: Math.floor(e / sizeM) * sizeM,
  n: Math.floor(n / sizeM) * sizeM,
  sizeM,
});

export const blockForLatLng = (
  position: LatLngPosition,
  sizeM: number
): BlockRef => blockForPoint(wgs84ToLaea(position), sizeM);

/**
 * Pixelkoordinate innerhalb eines Blocks, Ursprung oben links. Ganzzahlige
 * Werte bezeichnen **Pixelmitten**.
 *
 * Die Zeilen laufen von Nord nach Süd wie im Bild, die Blockkante `n` ist die
 * **untere** — daher die Umkehrung in `row`.
 *
 * Die Mitte von Pixel (0,0) liegt auf der Nordwestecke des Blocks, nicht einen
 * halben Pixel davon entfernt. Das ist die Konvention der BEV-Quelldateien: ihr
 * Georeferenz-Tiepoint liegt auf einer halben Pixelgrenze (`4799999.5`), die
 * Quellpixelmitten also auf ganzen Metern. Läge unser Gitter um einen halben
 * Pixel versetzt, fiele jede Blockpixelmitte genau zwischen zwei Quellpixel und
 * die Zuordnung entschiede das Gleitkommarauschen.
 *
 * Die Blöcke pflastern trotzdem lückenlos: Pixel `sizePx-1` eines Blocks und
 * Pixel `0` des nächsten liegen genau eine Rasterweite auseinander.
 */
export function pixelInBlock(
  point: LaeaPoint,
  block: BlockRef,
  resolutionM: number
): { col: number; row: number } {
  return {
    col: (point.e - block.e) / resolutionM,
    row: (block.n + block.sizeM - point.n) / resolutionM,
  };
}

/** Der LAEA-Punkt einer Pixelmitte. Umkehrung von `pixelInBlock`. */
export function blockPixelCenter(
  block: BlockRef,
  col: number,
  row: number,
  resolutionM: number
): LaeaPoint {
  return {
    e: block.e + col * resolutionM,
    n: block.n + block.sizeM - row * resolutionM,
  };
}

/**
 * Globaler Quellpixel-Index eines LAEA-Punkts in einem Raster, dessen
 * Tiepoint die **Ecke** von Pixel (0,0) bezeichnet (GeoTIFF
 * `RasterPixelIsArea`). Ganzzahlig gerundet, weil die Mitten bei unserem
 * Blockgitter exakt zusammenfallen und nur Gleitkommarauschen bleibt.
 */
export function sourcePixelIndex(
  point: LaeaPoint,
  origin: { originE: number; originN: number; pixelSizeM: number }
): { col: number; row: number } {
  // `+ 0` normalisiert das `-0`, das `Math.round` für kleine negative Werte
  // liefert: als Index harmlos, beim Vergleichen überraschend.
  return {
    col: Math.round((point.e - origin.originE) / origin.pixelSizeM - 0.5) + 0,
    row: Math.round((origin.originN - point.n) / origin.pixelSizeM - 0.5) + 0,
  };
}

export interface LaeaBounds {
  eMin: number;
  eMax: number;
  nMin: number;
  nMax: number;
}

/** Alle Blöcke, die eine LAEA-Bounding-Box berühren. */
export function blocksForBounds(
  bounds: LaeaBounds,
  sizeM: number
): BlockRef[] {
  const blocks: BlockRef[] = [];
  const eStart = Math.floor(bounds.eMin / sizeM) * sizeM;
  const nStart = Math.floor(bounds.nMin / sizeM) * sizeM;
  for (let n = nStart; n < bounds.nMax; n += sizeM) {
    for (let e = eStart; e < bounds.eMax; e += sizeM) {
      blocks.push({ e, n, sizeM });
    }
  }
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* BEV-Quellkacheln                                                            */
/* -------------------------------------------------------------------------- */

export const BEV_SOURCE_SIZE_M = 50_000;
export const BEV_TILE_PX = 256;
/**
 * Die Quelldateien sind 50001 × 50001 px groß, nicht 50000: ein halbes Pixel
 * Überlappung an jeder Kante. Das Kachelgitter ist damit 196 × 196.
 */
export const BEV_SOURCE_PX = 50_001;
export const BEV_TILE_COLS = Math.ceil(BEV_SOURCE_PX / BEV_TILE_PX);

/** Die 50-km-Quellkachel des BEV, in der ein Punkt liegt. */
export const bevSourceTile = (point: LaeaPoint): BlockRef =>
  blockForPoint(point, BEV_SOURCE_SIZE_M);

/** Dateiname einer BEV-Quellkachel. */
export const bevSourceTileName = (tile: BlockRef): string =>
  `CRS3035RES${tile.sizeM}mN${tile.n}E${tile.e}.tif`;

/**
 * Pixelkoordinate eines Punkts in einer BEV-Quellkachel.
 *
 * Der Rasterursprung liegt bei `(kachel.e - 0.5, kachel.n + 50000 + 0.5)` —
 * das Georeferenz-Tiepoint der Datei, nicht die Kachelkante.
 */
export function bevPixel(
  point: LaeaPoint,
  tile: BlockRef
): { col: number; row: number } {
  return {
    col: point.e - (tile.e - 0.5),
    row: tile.n + tile.sizeM + 0.5 - point.n,
  };
}

/** Index der internen 256×256-Kachel, in der ein Punkt liegt. */
export function bevTileIndex(point: LaeaPoint, tile: BlockRef): number {
  const { col, row } = bevPixel(point, tile);
  return (
    Math.floor(Math.floor(row) / BEV_TILE_PX) * BEV_TILE_COLS +
    Math.floor(Math.floor(col) / BEV_TILE_PX)
  );
}

/** Index der internen Kachel zu einer Pixelposition. */
export const bevTileIndexForPixel = (col: number, row: number): number =>
  Math.floor(row / BEV_TILE_PX) * BEV_TILE_COLS + Math.floor(col / BEV_TILE_PX);
