import { describe, expect, it } from 'vitest';
import { encodeAvailability } from './availability';
import {
  BlockStore,
  type TerrainBlock,
  type TerrainDecoder,
  type TerrainFetch,
} from './blockStore';
import { encodedToRgb, encodeHeight, NODATA_ENCODED } from './encoding';
import { sampleBlock, sampleTerrainAt } from './terrainSample';
import type {
  TerrainIndex,
  TerrainLevel,
  TerrainLevelId,
} from './terrainIndexTypes';

const level = (
  id: TerrainLevelId,
  resolutionM: number,
  cols: number,
  rows: number,
  isSet: (col: number, row: number) => boolean
): TerrainLevel => {
  const blockPx = 4;
  const blockSizeM = resolutionM * blockPx;
  return {
    id,
    resolutionM,
    blockPx,
    blockSizeM,
    base: 0,
    step: 0.1,
    nodataValue: NODATA_ENCODED,
    pathTemplate: `${id}/CRS3035RES${blockSizeM}mN{n}E{e}.png`,
    bounds: {
      eMin: 0,
      eMax: cols * blockSizeM,
      nMin: 0,
      nMax: rows * blockSizeM,
    },
    availability: encodeAvailability(cols, rows, isSet),
  };
};

/**
 * `detail` deckt nur die westlichen zwei Blöcke ab (e = 0 und e = 4),
 * `overview` das ganze Fenster. Damit sind Blocknaht, Stufenrückfall und
 * fehlende Abdeckung an einem Modell prüfbar.
 */
const detail = level('detail', 1, 4, 1, (col) => col < 2);
const overview = level('overview', 4, 1, 1, () => true);

/** Höhe = Ostwert in Metern. Damit ist jede Interpolation nachrechenbar. */
const heightAt = (e: number): number => e;

const testIndex = (): TerrainIndex => ({
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
  levels: [detail, overview],
});

/**
 * Der Dekoder erfährt über den Blob, welchen Block er vor sich hat, und
 * erzeugt das Höhenfeld daraus. So prüft der Test die echte Zuordnung von
 * Blockpixel zu Ortskoordinate, nicht bloß einen konstanten Puffer.
 */
function harness(options: { nodataAtDetailE?: number } = {}) {
  const fetchImpl: TerrainFetch = async (url) => {
    if (url.includes('index.json')) {
      return {
        ok: true,
        json: async () => testIndex(),
      } as unknown as Response;
    }
    const match = /CRS3035RES(\d+)mN(\d+)E(\d+)\.png/.exec(
      decodeURIComponent(url)
    );
    if (!match) return { ok: false, status: 404 } as unknown as Response;
    const sizeM = Number(match[1]);
    return {
      ok: true,
      blob: async () => new Blob([`${match[3]},${match[2]},${sizeM / 4}`]),
    } as unknown as Response;
  };

  const decode: TerrainDecoder = async (blob) => {
    const [e0, , res] = (await blob.text()).split(',').map(Number);
    const px = 4;
    const data = new Uint8ClampedArray(px * px * 4);
    for (let row = 0; row < px; row += 1) {
      for (let col = 0; col < px; col += 1) {
        const e = e0 + col * res;
        // nodata nur in der Detailstufe (res = 1), damit der Rückfall auf die
        // Übersicht prüfbar bleibt.
        const encoded =
          res === 1 && options.nodataAtDetailE === e
            ? NODATA_ENCODED
            : encodeHeight(heightAt(e), detail);
        const [r, g, b] = encodedToRgb(encoded);
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

/* -------------------------------------------------------------------------- */

const blockLevel = detail;

/** Rampe innerhalb eines Blocks: Höhe = 100 + Spalte. */
const ramp = (): TerrainBlock => {
  const heights = new Uint32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      heights[row * 4 + col] = encodeHeight(100 + col, blockLevel);
    }
  }
  return {
    heights,
    sizePx: 4,
    level: blockLevel,
    block: { e: 0, n: 0, sizeM: 4 },
  };
};

describe('sampleBlock', () => {
  it('interpoliert linear zwischen zwei Spalten', () => {
    // Pixelmitten liegen auf e = 0, 1, 2, 3; e = 0,5 liegt genau dazwischen.
    expect(sampleBlock(ramp(), { e: 0.5, n: 2 })?.heightM).toBeCloseTo(
      100.5,
      3
    );
  });

  it('liefert an der Pixelmitte den Pixelwert', () => {
    expect(sampleBlock(ramp(), { e: 2, n: 2 })?.heightM).toBeCloseTo(102, 3);
    expect(sampleBlock(ramp(), { e: 2, n: 2 })?.level).toBe('detail');
  });

  it('gibt null, wenn einer der vier Nachbarn nodata ist', () => {
    const block = ramp();
    block.heights[0] = NODATA_ENCODED;
    expect(sampleBlock(block, { e: 0.4, n: 2.6 })).toBeNull();
  });

  it('gibt null außerhalb des Blocks', () => {
    expect(sampleBlock(ramp(), { e: -1, n: 2 })).toBeNull();
    expect(sampleBlock(ramp(), { e: 2, n: 99 })).toBeNull();
    // Jenseits der letzten Pixelmitte: die Naht bedient `sampleTerrainAt`.
    expect(sampleBlock(ramp(), { e: 3.5, n: 2 })).toBeNull();
  });
});

describe('sampleTerrainAt', () => {
  it('interpoliert über die Blocknaht hinweg', async () => {
    const store = harness();
    // e = 3,5 liegt zwischen der letzten Spalte von Block e=0 (e = 3) und der
    // ersten von Block e=4. Ohne blockweise Nachbarsuche wäre hier `null`.
    const sample = await sampleTerrainAt(store, { e: 3.5, n: 2 });
    expect(sample?.heightM).toBeCloseTo(3.5, 3);
    expect(sample?.level).toBe('detail');
  });

  it('braucht auf einer Pixelmitte keinen Nachbarn', async () => {
    const store = harness();
    const sample = await sampleTerrainAt(store, { e: 3, n: 2 });
    expect(sample?.heightM).toBeCloseTo(3, 3);
    expect(sample?.level).toBe('detail');
  });

  it('fällt auf die Übersichtsstufe zurück, wo die Detailstufe fehlt', async () => {
    const store = harness();
    const sample = await sampleTerrainAt(store, { e: 9, n: 2 });
    expect(sample?.level).toBe('overview');
    expect(sample?.heightM).toBeCloseTo(9, 3);
  });

  it('fällt auch bei nodata in der Detailstufe auf die Übersicht zurück', async () => {
    const store = harness({ nodataAtDetailE: 4 });
    const sample = await sampleTerrainAt(store, { e: 3.5, n: 2 });
    expect(sample?.level).toBe('overview');
    expect(sample?.heightM).toBeCloseTo(3.5, 3);
  });

  it('gibt null, wo keine Stufe Daten hat', async () => {
    const store = harness();
    expect(await sampleTerrainAt(store, { e: 20, n: 2 })).toBeNull();
  });
});
