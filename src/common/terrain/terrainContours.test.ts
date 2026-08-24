import { describe, expect, it } from 'vitest';
import { encodeAvailability } from './availability';
import {
  BlockStore,
  type TerrainDecoder,
  type TerrainFetch,
} from './blockStore';
import { encodedToRgb, encodeHeight, NODATA_ENCODED } from './encoding';
import { wgs84ToLaea, laeaToWgs84 } from './projection';
import type { TerrainIndex, TerrainLevel } from './terrainIndexTypes';
import {
  chooseContourLevel,
  laeaHull,
  MAX_CONTOUR_CELLS,
  terrainContours,
} from './terrainContours';
import type { TerrainBoundsLatLng } from './terrainTypes';

/**
 * Verankert im echten Einsatzgebiet, nicht in einem synthetischen Nullpunkt:
 * die Höhenlinien laufen durch `wgs84ToLaea`, und dort ist die Verzerrung
 * ortsabhängig.
 */
const anchor = wgs84ToLaea([47.9483, 16.8482]);
const BLOCK_M = 4;
const GRID = 5; // 5 × 5 Blöcke, also 20 m × 20 m
const e0 = Math.floor(anchor.e / BLOCK_M) * BLOCK_M;
const n0 = Math.floor(anchor.n / BLOCK_M) * BLOCK_M;

/** Höhe = Nordwert über der Südkante. Höhenlinien laufen damit ost-west. */
const heightAtN = (n: number): number => n - n0;

const detailLevel = (
  isSet: (col: number, row: number) => boolean = () => true
): TerrainLevel => ({
  id: 'detail',
  resolutionM: 1,
  blockPx: BLOCK_M,
  blockSizeM: BLOCK_M,
  base: 0,
  step: 0.1,
  nodataValue: NODATA_ENCODED,
  pathTemplate: 'detail/CRS3035RES4mN{n}E{e}.png',
  bounds: {
    eMin: e0,
    eMax: e0 + GRID * BLOCK_M,
    nMin: n0,
    nMax: n0 + GRID * BLOCK_M,
  },
  availability: encodeAvailability(GRID, GRID, isSet),
});

const testIndex = (level: TerrainLevel): TerrainIndex => ({
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
  produced: '2026-08-24T00:00:00.000Z',
  levels: [level],
});

function harness(level: TerrainLevel): BlockStore {
  const fetchImpl: TerrainFetch = async (url) => {
    if (url.includes('index.json')) {
      return {
        ok: true,
        json: async () => testIndex(level),
      } as unknown as Response;
    }
    const match = /CRS3035RES(\d+)mN(\d+)E(\d+)\.png/.exec(
      decodeURIComponent(url)
    );
    if (!match) return { ok: false, status: 404 } as unknown as Response;
    return {
      ok: true,
      blob: async () => new Blob([`${match[3]},${match[2]}`]),
    } as unknown as Response;
  };

  const decode: TerrainDecoder = async (blob) => {
    const [, blockN] = (await blob.text()).split(',').map(Number);
    const px = BLOCK_M;
    const res = 1;
    const data = new Uint8ClampedArray(px * px * 4);
    for (let row = 0; row < px; row += 1) {
      // Südwest-Ausrichtung: Zeile 0 liegt auf `n + sizeM - res`.
      const n = blockN + BLOCK_M - res - row * res;
      const [r, g, b] = encodedToRgb(encodeHeight(heightAtN(n), level));
      for (let col = 0; col < px; col += 1) {
        const at = (row * px + col) * 4;
        data[at] = r;
        data[at + 1] = g;
        data[at + 2] = b;
        data[at + 3] = 255;
      }
    }
    return { data, width: px, height: px };
  };

  return new BlockStore({ bucket: 'test-bucket', fetch: fetchImpl, decode });
}

/** Lat/Lon-Rechteck, das ein LAEA-Fenster umschließt. */
const boundsFor = (
  eMin: number,
  eMax: number,
  nMin: number,
  nMax: number
): TerrainBoundsLatLng => {
  const corners = [
    laeaToWgs84({ e: eMin, n: nMin }),
    laeaToWgs84({ e: eMin, n: nMax }),
    laeaToWgs84({ e: eMax, n: nMin }),
    laeaToWgs84({ e: eMax, n: nMax }),
  ];
  return {
    south: Math.min(...corners.map((c) => c[0])),
    north: Math.max(...corners.map((c) => c[0])),
    west: Math.min(...corners.map((c) => c[1])),
    east: Math.max(...corners.map((c) => c[1])),
  };
};

/** Fenster zwei Meter innerhalb der abgedeckten Fläche. */
const window20m = boundsFor(e0 + 2, e0 + 18, n0 + 2, n0 + 18);

describe('laeaHull', () => {
  it('umschließt Ecken und Kantenmitten', () => {
    const hull = laeaHull(window20m);
    for (const position of [
      [window20m.south, window20m.west],
      [window20m.north, window20m.east],
      [window20m.south, (window20m.west + window20m.east) / 2],
      [(window20m.south + window20m.north) / 2, window20m.east],
    ] as [number, number][]) {
      const point = wgs84ToLaea(position);
      expect(point.e).toBeGreaterThanOrEqual(hull.eMin);
      expect(point.e).toBeLessThanOrEqual(hull.eMax);
      expect(point.n).toBeGreaterThanOrEqual(hull.nMin);
      expect(point.n).toBeLessThanOrEqual(hull.nMax);
    }
  });
});

describe('chooseContourLevel', () => {
  const withOverview = (): TerrainIndex => {
    const index = testIndex(detailLevel());
    index.levels.push({
      ...detailLevel(),
      id: 'overview',
      resolutionM: 10,
      blockSizeM: 40,
      pathTemplate: 'overview/CRS3035RES40mN{n}E{e}.png',
    });
    return index;
  };

  it('nimmt die Detailstufe für einen kleinen Ausschnitt', () => {
    const level = chooseContourLevel(withOverview(), laeaHull(window20m));
    expect(level?.id).toBe('detail');
  });

  it('weicht auf die Übersicht aus, wenn die Detailstufe das Budget sprengt', () => {
    // 5 km Kantenlänge sind in 1 m Raster 25 Mio. Zellen, in 10 m 250.000.
    const hull = { eMin: e0, eMax: e0 + 5000, nMin: n0, nMax: n0 + 5000 };
    expect(chooseContourLevel(withOverview(), hull)?.id).toBe('overview');
  });

  it('gibt undefined, wenn auch die gröbste Stufe zu groß wäre', () => {
    const side = Math.sqrt(MAX_CONTOUR_CELLS) * 10 * 2;
    const hull = { eMin: e0, eMax: e0 + side, nMin: n0, nMax: n0 + side };
    expect(chooseContourLevel(withOverview(), hull)).toBeUndefined();
  });
});

describe('terrainContours', () => {
  it('zieht eine Linie durchgehend über die Blockgrenzen', async () => {
    const store = harness(detailLevel());
    const { lines, level, resolutionM } = await terrainContours(
      store,
      window20m,
      5
    );

    // Höhen 2 bis 18 im Fenster, Äquidistanz 5 ⇒ Schwellen 5, 10, 15.
    expect(lines.map((line) => line.heightM)).toEqual([5, 10, 15]);
    // Stufe und Rasterweite kommen mit: die Legende muss sagen können, wie
    // genau die Linien sind.
    expect(level).toBe('detail');
    expect(resolutionM).toBe(1);
    // Genau eine Linie je Schwelle: blockweise gerechnet wären es fünf,
    // eine je Blockspalte.
    for (const line of lines) {
      expect(line.points.length).toBeGreaterThanOrEqual(2);
      expect(line.closed).toBe(false);
    }
  });

  it('läuft ost-west, wie es das Höhenfeld vorgibt', async () => {
    const store = harness(detailLevel());
    const [line] = (await terrainContours(store, window20m, 5)).lines;
    const lats = line.points.map((point) => point[0]);
    const lngs = line.points.map((point) => point[1]);
    // Die Linie überstreicht deutlich mehr Länge als Breite.
    expect(Math.max(...lngs) - Math.min(...lngs)).toBeGreaterThan(
      (Math.max(...lats) - Math.min(...lats)) * 5
    );
  });

  it('unterbricht die Linie an einem fehlenden Block', async () => {
    // Der mittlere Block (Spalte 2, Zeile 2) fehlt. Er deckt die Höhen 8 bis
    // 11 ab, also trennt er die Schwelle 10 — und nur die.
    const store = harness(
      detailLevel((col, row) => !(col === 2 && row === 2))
    );
    const { lines } = await terrainContours(store, window20m, 5);
    const perHeight = new Map<number, number>();
    for (const line of lines) {
      perHeight.set(line.heightM, (perHeight.get(line.heightM) ?? 0) + 1);
    }
    expect(perHeight.get(5)).toBe(1);
    expect(perHeight.get(15)).toBe(1);
    expect(perHeight.get(10)).toBe(2);
  });

  it('gibt ohne Index keine Linien', async () => {
    const store = new BlockStore({
      bucket: 'test-bucket',
      fetch: async () => ({ ok: false, status: 503 }) as unknown as Response,
      decode: async () => {
        throw new Error('darf nicht aufgerufen werden');
      },
    });
    expect(await terrainContours(store, window20m, 5)).toEqual({ lines: [] });
  });
});
