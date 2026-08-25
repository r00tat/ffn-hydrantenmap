import { describe, expect, it } from 'vitest';
import { laeaToWgs84 } from './projection';
import { wgs84ToLaea } from './projection';
import type { TerrainIndex } from './terrainIndexTypes';
import { harnessOrigin, terrainHarness } from './terrainTestHarness';
import {
  buildMosaic,
  chooseContourLevel,
  laeaHull,
  MAX_CONTOUR_CELLS,
} from './terrainMosaic';
import type { TerrainBoundsLatLng } from './terrainTypes';

const BLOCK_PX = 4;
const GRID = 5; // 5 × 5 Blöcke, also 20 m × 20 m

/**
 * Höhe = Abstand von der Westkante in m. Damit ist jede Spalte für sich
 * prüfbar — und die Werte bleiben in der 24-Bit-Kodierung, die bei 0,1 m
 * Schrittweite bei rund 1,6 Mio. m endet. Der rohe LAEA-Ostwert liegt bei
 * 4,7 Mio. und käme als nodata zurück.
 */
const harness = (exists?: (col: number, row: number) => boolean) =>
  terrainHarness({
    blockPx: BLOCK_PX,
    grid: GRID,
    height: (col) => col - harnessOrigin(BLOCK_PX).e0,
    exists,
  });

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

describe('laeaHull', () => {
  it('umschließt Ecken und Kantenmitten', () => {
    const { e0, n0 } = harness();
    const window20m = boundsFor(e0 + 2, e0 + 18, n0 + 2, n0 + 18);
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
  /** Derselbe Index, um eine Übersichtsstufe mit 10 m Raster erweitert. */
  const withOverview = (): TerrainIndex => {
    const { index, level } = harness();
    index.levels.push({
      ...level,
      id: 'overview',
      resolutionM: 10,
      blockSizeM: 40,
      pathTemplate: 'overview/CRS3035RES40mN{n}E{e}.png',
    });
    return index;
  };

  it('nimmt die Detailstufe für einen kleinen Ausschnitt', () => {
    const { e0, n0 } = harness();
    const window20m = boundsFor(e0 + 2, e0 + 18, n0 + 2, n0 + 18);
    expect(chooseContourLevel(withOverview(), laeaHull(window20m))?.id).toBe(
      'detail'
    );
  });

  it('weicht auf die Übersicht aus, wenn die Detailstufe das Budget sprengt', () => {
    const { e0, n0 } = harness();
    // 5 km Kantenlänge sind in 1 m Raster 25 Mio. Zellen, in 10 m 250.000.
    const hull = { eMin: e0, eMax: e0 + 5000, nMin: n0, nMax: n0 + 5000 };
    expect(chooseContourLevel(withOverview(), hull)?.id).toBe('overview');
  });

  it('gibt undefined, wenn auch die gröbste Stufe zu groß wäre', () => {
    const { e0, n0 } = harness();
    const side = Math.sqrt(MAX_CONTOUR_CELLS) * 10 * 2;
    const hull = { eMin: e0, eMax: e0 + side, nMin: n0, nMax: n0 + side };
    expect(chooseContourLevel(withOverview(), hull)).toBeUndefined();
  });
});

describe('buildMosaic', () => {
  it('setzt die Blöcke zu einem durchgehenden Gitter zusammen', async () => {
    const { store, level, e0, n0 } = harness();
    const hull = { eMin: e0 + 2, eMax: e0 + 18, nMin: n0 + 2, nMax: n0 + 18 };
    const mosaic = await buildMosaic(store, level, hull);

    expect(mosaic).toBeDefined();
    expect(mosaic!.cols).toBe(17);
    expect(mosaic!.rows).toBe(17);
    expect(mosaic!.colMin).toBe(e0 + 2);
    // Spalte 0 liegt auf `e0 + 2`, Spalte 16 auf `e0 + 18`. Über die
    // Blockgrenze bei `e0 + 4` hinweg muss die Höhe durchlaufen.
    expect(mosaic!.values[0]).toBeCloseTo(2, 1);
    expect(mosaic!.values[16]).toBeCloseTo(18, 1);
    expect(mosaic!.values[16 * 17]).toBeCloseTo(2, 1);
  });

  it('lässt fehlende Blöcke als NaN stehen', async () => {
    // Die östlichste Blockspalte steht nicht im Index.
    const { store, level, e0, n0 } = harness((col) => col < GRID - 1);
    const hull = { eMin: e0 + 2, eMax: e0 + 18, nMin: n0 + 2, nMax: n0 + 18 };
    const mosaic = await buildMosaic(store, level, hull);

    expect(mosaic).toBeDefined();
    // Spalte 0 liegt im vorhandenen Teil, Spalte 16 (`e0 + 18`) im fehlenden.
    expect(Number.isNaN(mosaic!.values[0])).toBe(false);
    expect(Number.isNaN(mosaic!.values[16])).toBe(true);
  });
});
