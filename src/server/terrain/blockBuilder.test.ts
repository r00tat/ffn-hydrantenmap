import { open } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BEV_TILE_PX } from '../../common/terrain/grid';
import { readBigTiffInfo, type BigTiffInfo, type FetchRange } from './bigtiff';
import { buildBlock, decimate, memoTileReader } from './blockBuilder';

describe('decimate', () => {
  it('mittelt über die Gruppe', () => {
    expect(Array.from(decimate(Float32Array.from([1, 2, 3, 4]), 2, 2))).toEqual([
      2.5,
    ]);
  });

  it('macht aus einer Gruppe mit nodata nodata, nicht einen halben Mittelwert', () => {
    const out = decimate(Float32Array.from([10, 10, 10, Number.NaN]), 2, 2);
    expect(Number.isNaN(out[0])).toBe(true);
    // Der falsche Wert wäre 7,5 — ein Gelände, das es nicht gibt.
    expect(out[0]).not.toBe(7.5);
  });

  it('behält die Kantenlänge', () => {
    expect(decimate(new Float32Array(100).fill(5), 10, 5)).toHaveLength(4);
    expect(decimate(new Float32Array(10_000).fill(5), 100, 10)).toHaveLength(
      100
    );
  });

  it('mittelt zeilenweise richtig, nicht spaltenweise', () => {
    // 4×4, Wert = Zeilenindex. Nach Faktor 2 muss die obere Zeile 0,5 sein.
    const source = new Float32Array(16);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) source[row * 4 + col] = row;
    }
    expect(Array.from(decimate(source, 4, 2))).toEqual([0.5, 0.5, 2.5, 2.5]);
  });
});

/**
 * Künstliche Quelldatei: 512 × 512 px bei 1 m, also 2 × 2 interne Kacheln.
 * Der Rasterursprung liegt wie bei den echten BEV-Dateien auf einer halben
 * Pixelgrenze.
 */
const info: BigTiffInfo = {
  width: 512,
  height: 512,
  tileWidth: BEV_TILE_PX,
  tileHeight: BEV_TILE_PX,
  tileCols: 2,
  tileRows: 2,
  originE: 4_799_999.5,
  originN: 2_800_000.5,
  pixelSizeM: 1,
  nodata: -9999,
  tileOffsets: new BigUint64Array(4),
  tileByteCounts: new BigUint64Array(4),
};

/**
 * Kachelinhalt mit eindeutig rückrechenbarem Wert:
 * `1000 + globaleSpalte + globaleZeile / 1000`.
 */
const syntheticTile = (index: number): Float32Array => {
  const tileCol = index % info.tileCols;
  const tileRow = Math.floor(index / info.tileCols);
  const tile = new Float32Array(BEV_TILE_PX * BEV_TILE_PX);
  for (let row = 0; row < BEV_TILE_PX; row += 1) {
    for (let col = 0; col < BEV_TILE_PX; col += 1) {
      tile[row * BEV_TILE_PX + col] =
        1000 +
        (tileCol * BEV_TILE_PX + col) +
        (tileRow * BEV_TILE_PX + row) / 1000;
    }
  }
  return tile;
};

describe('buildBlock', () => {
  it('ordnet jedes Blockpixel dem richtigen Quellpixel zu', async () => {
    // Das Pixelgitter ist an der Südwestecke ausgerichtet: die nördlichste
    // Pixelmitte liegt auf `n + sizeM - res`, also eine Rasterweite unter der
    // Blockkante. Dieser Block liest damit Quellspalten 0..255 und
    // Quellzeilen 1..256.
    const block = { e: 4_800_000, n: 2_799_744, sizeM: 256 };
    const heights = await buildBlock({
      block,
      info,
      readTileAt: async (index) => syntheticTile(index),
      resolutionM: 1,
    });

    expect(heights).toHaveLength(256 * 256);
    // Nordwestpixel des Blocks: Quellspalte 0, Quellzeile 1.
    expect(heights[0]).toBeCloseTo(1000.001, 4);
    // Ein Pixel weiter östlich ⇒ Quellspalte 1.
    expect(heights[1]).toBeCloseTo(1001.001, 4);
    // Ein Pixel weiter südlich ⇒ Quellzeile 2.
    expect(heights[256]).toBeCloseTo(1000.002, 4);
    // Südostpixel des Blocks: Quellspalte 255, Quellzeile 256.
    expect(heights[255 * 256 + 255]).toBeCloseTo(1255.256, 3);
  });

  it('greift über Kachelgrenzen hinweg auf die richtige Kachel zu', async () => {
    // Block über der Mitte der Quelldatei, damit alle vier Kacheln beteiligt
    // sind: Quellspalten 128..383, Quellzeilen 129..384.
    const block = { e: 4_800_128, n: 2_799_616, sizeM: 256 };
    const heights = await buildBlock({
      block,
      info,
      readTileAt: async (index) => syntheticTile(index),
      resolutionM: 1,
    });
    expect(heights[0]).toBeCloseTo(1128.129, 3);
    expect(heights[255 * 256 + 255]).toBeCloseTo(1383.384, 3);
  });

  it('lässt Pixel außerhalb der Quelldatei als nodata stehen', async () => {
    const heights = await buildBlock({
      block: { e: 4_900_000, n: 2_900_000, sizeM: 256 },
      info,
      readTileAt: async (index) => syntheticTile(index),
      resolutionM: 1,
    });
    expect(heights.every((value) => Number.isNaN(value))).toBe(true);
  });

  it('fordert die Kacheln eines Blocks gleichzeitig an', async () => {
    // Nacheinander geladen kostet ein 1-km-Block bis zu 25 Rundreisen
    // hintereinander — das ist der Unterschied zwischen einem Import über
    // Nacht und einem über eine Stunde.
    let inFlight = 0;
    let peak = 0;
    await buildBlock({
      block: { e: 4_800_128, n: 2_799_616, sizeM: 256 },
      info,
      readTileAt: async (index) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return syntheticTile(index);
      },
      resolutionM: 1,
    });
    // Vier berührte Kacheln, alle gleichzeitig unterwegs.
    expect(peak).toBe(4);
  });

  it('liest jede Kachel genau einmal, auch ohne Memo', async () => {
    const seen = new Map<number, number>();
    await buildBlock({
      block: { e: 4_800_128, n: 2_799_616, sizeM: 256 },
      info,
      readTileAt: async (index) => {
        seen.set(index, (seen.get(index) ?? 0) + 1);
        return syntheticTile(index);
      },
      resolutionM: 1,
    });
    expect([...seen.values()]).toEqual([1, 1, 1, 1]);
  });

  it('lässt Pixel leerer Kacheln als nodata stehen', async () => {
    const heights = await buildBlock({
      block: { e: 4_800_000, n: 2_799_744, sizeM: 256 },
      info,
      readTileAt: async () => undefined,
      resolutionM: 1,
    });
    expect(heights.every((value) => Number.isNaN(value))).toBe(true);
  });

  it('übernimmt den nodata-Wert der Quelle nicht als Höhe', async () => {
    const heights = await buildBlock({
      block: { e: 4_800_000, n: 2_799_744, sizeM: 256 },
      info,
      readTileAt: async () =>
        new Float32Array(BEV_TILE_PX * BEV_TILE_PX).fill(-9999),
      resolutionM: 1,
    });
    expect(heights.every((value) => Number.isNaN(value))).toBe(true);
    expect(Array.from(heights).includes(-9999)).toBe(false);
  });
});

describe('memoTileReader', () => {
  it('holt jede Kachel nur einmal', async () => {
    const fetchRange = vi.fn(async () => new Uint8Array(0));
    const reader = memoTileReader(
      { ...info, tileByteCounts: new BigUint64Array(4) },
      fetchRange
    );
    await reader(0);
    await reader(0);
    await reader(0);
    // ByteCount 0 ⇒ readTile fragt gar nicht erst an.
    expect(fetchRange).not.toHaveBeenCalled();
  });

  it('holt eine gleichzeitig zweimal angeforderte Kachel nur einmal', async () => {
    // Die echte Quelle: `buildBlock` fordert alle Kacheln eines Blocks
    // gleichzeitig an. Ein Cache, der erst nach dem `await` schreibt, lädt
    // dieselbe Kachel dann doppelt.
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const handle = await open(path.join(dir, 'bigtiff.fixture.tif'), 'r');
    try {
      let requests = 0;
      const fileRange: FetchRange = async (from, to) => {
        requests += 1;
        const buffer = Buffer.alloc(to - from + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, from);
        return new Uint8Array(buffer.subarray(0, bytesRead));
      };
      const fixtureInfo = await readBigTiffInfo(fileRange);
      const index = fixtureInfo.tileByteCounts.findIndex((count) => count > 0);
      expect(index).toBeGreaterThanOrEqual(0);

      requests = 0;
      const reader = memoTileReader(fixtureInfo, fileRange);
      const [first, second] = await Promise.all([reader(index), reader(index)]);
      expect(requests).toBe(1);
      expect(first).toBe(second);
    } finally {
      await handle.close();
    }
  });

  it('merkt sich einen Fehlschlag nicht', async () => {
    let calls = 0;
    const failing = memoTileReader(
      { ...info, tileByteCounts: BigUint64Array.from([8, 0, 0, 0], BigInt) },
      async () => {
        calls += 1;
        throw new Error('Netz weg');
      }
    );
    await expect(failing(0)).rejects.toThrow('Netz weg');
    await expect(failing(0)).rejects.toThrow('Netz weg');
    // Zweiter Versuch, nicht das gemerkte Scheitern von vorhin.
    expect(calls).toBe(2);
  });

  it('reicht denselben Wert bei wiederholtem Zugriff heraus', async () => {
    let calls = 0;
    const counting = memoTileReader(info, async () => {
      calls += 1;
      return new Uint8Array(0);
    });
    await counting(1);
    await counting(1);
    expect(calls).toBe(0);
  });
});
