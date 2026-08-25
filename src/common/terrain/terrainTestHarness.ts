import { encodeAvailability } from './availability';
import {
  BlockStore,
  type TerrainDecoder,
  type TerrainFetch,
} from './blockStore';
import { encodedToRgb, encodeHeight, NODATA_ENCODED } from './encoding';
import { laeaToWgs84, wgs84ToLaea } from './projection';
import type { TerrainIndex, TerrainLevel } from './terrainIndexTypes';

/**
 * Ein echter `BlockStore` über gefälschtem `fetch` und `decode`.
 *
 * Kein Netz, keine Bilddekodierung — aber die echte Blockmathematik, der echte
 * LRU-Cache und die echte Verfügbarkeitsprüfung. Genau die sind es, an denen
 * eine Füllung über Blockgrenzen scheitert.
 *
 * Verankert im echten Einsatzgebiet und nicht in einem synthetischen
 * Nullpunkt: alles läuft durch `wgs84ToLaea`, und dort ist die Verzerrung
 * ortsabhängig.
 */

export const HARNESS_ANCHOR: [number, number] = [47.9483, 16.8482];

export interface HarnessOptions {
  /** Kantenlänge eines Blocks in Pixeln **und** Metern (Rasterweite 1 m). */
  blockPx: number;
  /** Blöcke je Achse. */
  grid: number;
  /** Höhe in m an einer globalen Zelle, `undefined` = nodata. */
  height: (col: number, row: number) => number | undefined;
  /** Blöcke, die laut Index existieren. Ohne Angabe: alle. */
  exists?: (col: number, row: number) => boolean;
  /** Block-IDs, deren Abruf fehlschlägt, obwohl sie im Index stehen. */
  failing?: string[];
}

export interface Harness {
  store: BlockStore;
  level: TerrainLevel;
  index: TerrainIndex;
  /** Südwestecke des Gitters in LAEA. */
  e0: number;
  n0: number;
  /** Globaler Spalten-/Zeilenindex einer Zelle: `col = e / res`, `row = -n / res`. */
  colOf: (e: number) => number;
  rowOf: (n: number) => number;
  /** Lat/Lon der Mitte einer globalen Zelle — für Saatpunkte in Tests. */
  latLngOfCell: (col: number, row: number) => [number, number];
}

/**
 * Südwestecke des Gitters in LAEA — **vor** dem Bau des Gerüsts.
 *
 * Ein Höhenmuster wird in globalen Zellen formuliert, und die liegen bei
 * EPSG:3035 in Millionen. Ein Test braucht den Ursprung also, bevor er den
 * `height`-Rückruf schreiben kann, der an `terrainHarness` übergeben wird.
 */
export function harnessOrigin(blockPx: number): { e0: number; n0: number } {
  const anchor = wgs84ToLaea(HARNESS_ANCHOR);
  return {
    e0: Math.floor(anchor.e / blockPx) * blockPx,
    n0: Math.floor(anchor.n / blockPx) * blockPx,
  };
}

export function terrainHarness(options: HarnessOptions): Harness {
  const { blockPx, grid, height } = options;
  const { e0, n0 } = harnessOrigin(blockPx);

  const level: TerrainLevel = {
    id: 'detail',
    resolutionM: 1,
    blockPx,
    blockSizeM: blockPx,
    base: 0,
    step: 0.1,
    nodataValue: NODATA_ENCODED,
    pathTemplate: `detail/CRS3035RES${blockPx}mN{n}E{e}.png`,
    bounds: {
      eMin: e0,
      eMax: e0 + grid * blockPx,
      nMin: n0,
      nMax: n0 + grid * blockPx,
    },
    availability: encodeAvailability(
      grid,
      grid,
      options.exists ?? (() => true)
    ),
  };

  const index: TerrainIndex = {
    version: 1,
    crs: 'EPSG:3035',
    heightDatum: 'EVRF2000',
    adriaOffset: {
      latMin: 46.7,
      lonMin: 16.1,
      latStep: 0.05,
      lonStep: 0.07,
      cols: 1,
      rows: 1,
      baseMm: 410,
      values: 'AA==',
      meanM: 0.41,
      minM: 0.41,
      maxM: 0.41,
      sourcePoints: 1,
    },
    source: {
      name: 'BEV ALS-DGM 1 m',
      epoch: '20190915',
      license: 'CC BY 4.0',
      attribution: 'Datenquelle: BEV',
    },
    produced: '2026-08-25T00:00:00.000Z',
    levels: [level],
  };

  const failing = new Set(options.failing ?? []);

  const fetchImpl: TerrainFetch = async (url) => {
    const path = decodeURIComponent(url);
    if (path.includes('index.json')) {
      return { ok: true, json: async () => index } as unknown as Response;
    }
    const match = /CRS3035RES(\d+)mN(\d+)E(\d+)\.png/.exec(path);
    if (!match) return { ok: false, status: 404 } as unknown as Response;
    const id = `CRS3035RES${match[1]}mN${match[2]}E${match[3]}`;
    if (failing.has(id)) {
      return { ok: false, status: 503 } as unknown as Response;
    }
    const n = Number(match[2]);
    const e = Number(match[3]);
    // Der Blob trägt nur die Blockkoordinaten; dekodiert wird unten.
    return {
      ok: true,
      blob: async () => ({ n, e }) as unknown as Blob,
    } as unknown as Response;
  };

  const decode: TerrainDecoder = async (blob) => {
    const { n, e } = blob as unknown as { n: number; e: number };
    const data = new Uint8ClampedArray(blockPx * blockPx * 4);
    // Spalte 0 liegt auf `e`, Zeile `blockPx-1` auf `n` — die Südwestecke,
    // genau wie `pixelInBlock` es voraussetzt.
    for (let row = 0; row < blockPx; row += 1) {
      const cellN = n + blockPx - 1 - row;
      for (let col = 0; col < blockPx; col += 1) {
        const cellE = e + col;
        const encoded = encodeHeight(height(cellE, -cellN), level);
        const [r, g, b] = encodedToRgb(encoded);
        const o = (row * blockPx + col) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    return { data, width: blockPx, height: blockPx };
  };

  return {
    store: new BlockStore({ bucket: 'test', fetch: fetchImpl, decode }),
    level,
    index,
    e0,
    n0,
    colOf: (e) => e,
    rowOf: (n) => -n,
    latLngOfCell: (col, row) => laeaToWgs84({ e: col, n: -row }),
  };
}
