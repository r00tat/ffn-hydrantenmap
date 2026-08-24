import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeAvailability } from './availability';
import {
  BlockStore,
  RETRY_AFTER_MS,
  type TerrainDecoder,
  type TerrainFetch,
} from './blockStore';
import { NODATA_ENCODED } from './encoding';
import type {
  TerrainIndex,
  TerrainLevel,
  TerrainLevelId,
} from './terrainIndexTypes';

/**
 * Ein winziges Höhenmodell: Blöcke von 2 × 2 Pixeln, damit die Fälle ohne
 * Megabyte-Puffer prüfbar bleiben.
 *
 * `detail` deckt nur die linke Hälfte ab (Spalten 0–7 von 16). Damit ist der
 * Rückfall auf `overview` prüfbar, ohne dass es ein Sonderfall im Test wäre —
 * genau die Situation an der Landesgrenze und bei einem Teil-Rollout.
 */
const level = (
  id: TerrainLevelId,
  blockSizeM: number,
  cols: number,
  rows: number,
  isSet: (col: number, row: number) => boolean
): TerrainLevel => ({
  id,
  resolutionM: blockSizeM / 2,
  blockPx: 2,
  blockSizeM,
  base: 0,
  step: 0.1,
  nodataValue: NODATA_ENCODED,
  pathTemplate: `${id}/CRS3035RES${blockSizeM}mN{n}E{e}.png`,
  bounds: { eMin: 0, eMax: cols * blockSizeM, nMin: 0, nMax: rows * blockSizeM },
  availability: encodeAvailability(cols, rows, isSet),
});

const detail = level('detail', 2, 16, 4, (col) => col < 8);
const overview = level('overview', 8, 4, 1, () => true);

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

interface HarnessOptions {
  indexOk?: boolean;
  failBlocks?: number | 'always';
  maxBlocks?: number;
  imagePx?: number;
}

/**
 * Gefälschtes `fetch` und gefälschter Dekoder.
 *
 * Der Dekoder liefert eine Rampe (kodierter Wert = Pixelindex), damit neben
 * dem Zwischenspeichern auch geprüft ist, dass die Bytes in der erwarteten
 * Reihenfolge ankommen.
 */
function harness(options: HarnessOptions = {}) {
  const urls: string[] = [];
  const px = options.imagePx ?? 2;
  let blockAttempts = 0;

  const fetchImpl: TerrainFetch = async (url) => {
    urls.push(url);
    if (url.includes('index.json')) {
      return options.indexOk === false
        ? ({ ok: false, status: 503 } as unknown as Response)
        : ({
            ok: true,
            status: 200,
            json: async () => testIndex(),
          } as unknown as Response);
    }
    blockAttempts += 1;
    const fail =
      options.failBlocks === 'always' ||
      (typeof options.failBlocks === 'number' &&
        blockAttempts <= options.failBlocks);
    return fail
      ? ({ ok: false, status: 500 } as unknown as Response)
      : ({
          ok: true,
          status: 200,
          blob: async () => new Blob([]),
        } as unknown as Response);
  };

  const decode: TerrainDecoder = async () => {
    const data = new Uint8ClampedArray(px * px * 4);
    for (let i = 0; i < px * px; i += 1) {
      data[i * 4 + 2] = i; // Blaukanal = niedrigstes Byte des kodierten Werts
      data[i * 4 + 3] = 255;
    }
    return { data, width: px, height: px };
  };

  const store = new BlockStore({
    bucket: 'test-bucket',
    fetch: fetchImpl,
    decode,
    maxBlocks: options.maxBlocks,
  });
  return {
    store,
    urls,
    blockUrls: () => urls.filter((url) => !url.includes('index.json')),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('BlockStore', () => {
  it('bildet die URL, auf die die Service-Worker-Regel greift', async () => {
    const { store, blockUrls } = harness();
    await store.block('detail', { e: 0, n: 0, sizeM: 2 });
    const url = blockUrls()[0];
    // Ändert sich das, greift `cachePatterns` in src/worker/patterns.ts nicht
    // mehr — und die Offlinefähigkeit fällt lautlos aus.
    expect(url).toContain('/o/terrain%2F');
    expect(url).toContain('terrain%2Fv1%2Fdetail%2FCRS3035RES2mN0E0.png');
    expect(url).toContain('alt=media');
  });

  it('holt einen Block nicht, dessen Bit nicht gesetzt ist', async () => {
    const { store, blockUrls } = harness();
    // Spalte 10 von 16 — außerhalb der abgedeckten linken Hälfte.
    expect(await store.block('detail', { e: 20, n: 0, sizeM: 2 })).toBeUndefined();
    expect(blockUrls()).toHaveLength(0);
  });

  it('dekodiert einen Block und beantwortet ihn danach aus dem Cache', async () => {
    const { store, blockUrls } = harness();
    const first = await store.block('detail', { e: 0, n: 0, sizeM: 2 });
    expect(first?.sizePx).toBe(2);
    expect(Array.from(first?.heights ?? [])).toEqual([0, 1, 2, 3]);

    const second = await store.block('detail', { e: 0, n: 0, sizeM: 2 });
    expect(second).toBe(first);
    expect(blockUrls()).toHaveLength(1);
  });

  it('fasst gleichzeitige Anfragen auf denselben Block zusammen', async () => {
    const { store, blockUrls } = harness();
    const [a, b] = await Promise.all([
      store.block('detail', { e: 0, n: 0, sizeM: 2 }),
      store.block('detail', { e: 0, n: 0, sizeM: 2 }),
    ]);
    expect(a).toBe(b);
    expect(blockUrls()).toHaveLength(1);
  });

  it('verdrängt den ältesten Block und lädt ihn danach erneut', async () => {
    const { store, blockUrls } = harness({ maxBlocks: 2 });
    for (const e of [0, 2, 4]) {
      await store.block('detail', { e, n: 0, sizeM: 2 });
    }
    expect(blockUrls()).toHaveLength(3);

    // e = 0 wurde verdrängt.
    await store.block('detail', { e: 0, n: 0, sizeM: 2 });
    expect(blockUrls()).toHaveLength(4);

    // e = 4 liegt noch im Cache.
    await store.block('detail', { e: 4, n: 0, sizeM: 2 });
    expect(blockUrls()).toHaveLength(4);
  });

  it('nimmt die feinste Stufe und fällt sonst auf die gröbere zurück', async () => {
    const { store } = harness();
    expect((await store.bestBlockFor({ e: 1, n: 1 }))?.level.id).toBe('detail');
    // Dort fehlt die Detailstufe, die Übersicht deckt sie ab.
    expect((await store.bestBlockFor({ e: 21, n: 1 }))?.level.id).toBe(
      'overview'
    );
  });

  it('verwirft eine Kachel mit falscher Pixelgröße', async () => {
    const { store } = harness({ imagePx: 3 });
    expect(await store.block('detail', { e: 0, n: 0, sizeM: 2 })).toBeUndefined();
  });

  it('versucht es genau zweimal und sperrt den Block dann für eine Minute', async () => {
    vi.useFakeTimers();
    const { store, blockUrls } = harness({ failBlocks: 'always' });
    const ref = { e: 0, n: 0, sizeM: 2 };

    expect(await store.block('detail', ref)).toBeUndefined();
    expect(blockUrls()).toHaveLength(2);

    expect(await store.block('detail', ref)).toBeUndefined();
    expect(blockUrls()).toHaveLength(2);

    vi.advanceTimersByTime(RETRY_AFTER_MS + 1);
    expect(await store.block('detail', ref)).toBeUndefined();
    expect(blockUrls()).toHaveLength(4);
  });

  it('gibt nach einem einzelnen Fehlschlag den Block aus dem zweiten Versuch', async () => {
    const { store, blockUrls } = harness({ failBlocks: 1 });
    expect(await store.block('detail', { e: 0, n: 0, sizeM: 2 })).toBeDefined();
    expect(blockUrls()).toHaveLength(2);
  });

  it('beantwortet ohne Index alles mit undefined und wartet mit dem nächsten Versuch', async () => {
    vi.useFakeTimers();
    const { store, urls } = harness({ indexOk: false });

    expect(await store.block('detail', { e: 0, n: 0, sizeM: 2 })).toBeUndefined();
    expect(await store.bestBlockFor({ e: 1, n: 1 })).toBeUndefined();
    expect(urls).toHaveLength(1);

    vi.advanceTimersByTime(RETRY_AFTER_MS + 1);
    expect(await store.block('detail', { e: 0, n: 0, sizeM: 2 })).toBeUndefined();
    expect(urls).toHaveLength(2);
  });
});

describe('BlockStore.warm', () => {
  it('holt die Kacheln, ohne sie zu dekodieren', async () => {
    const { store, blockUrls } = harness();
    const result = await store.warm('detail', [
      'CRS3035RES2mN0E0',
      'CRS3035RES2mN0E2',
    ]);
    expect(result).toEqual({ loaded: 2, failed: 0 });
    expect(blockUrls()).toHaveLength(2);
  });

  it('zählt nicht vorhandene und unlesbare Blöcke als fehlgeschlagen, ohne sie zu holen', async () => {
    const { store, blockUrls } = harness();
    const result = await store.warm('detail', [
      'CRS3035RES2mN0E20', // Bit nicht gesetzt
      'kein-blockname',
    ]);
    expect(result).toEqual({ loaded: 0, failed: 2 });
    expect(blockUrls()).toHaveLength(0);
  });
});
