import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  lzwDecode,
  readBigTiffInfo,
  readTile,
  type FetchRange,
} from './bigtiff';

const dir = path.dirname(new URL(import.meta.url).pathname);
const fixturePath = path.join(dir, 'bigtiff.fixture.tif');
const metaPath = path.join(dir, 'bigtiff.fixture.json');

interface FixtureMeta {
  width: number;
  height: number;
  tileWidth: number;
  tileCols: number;
  tileCount: number;
  nodata: number;
  tiepoint: number[];
  tile: {
    index: number;
    byteLength: number;
    pixels: number;
    minHeight: number;
    maxHeight: number;
    meanHeight: number;
    firstValue: number;
  };
}

let meta: FixtureMeta;
let handle: Awaited<ReturnType<typeof open>>;
let requests = 0;

/** Range-Reader auf die Datei — der Test kommt ohne Netz aus. */
const fileRange: FetchRange = async (from, to) => {
  requests += 1;
  const length = to - from + 1;
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, from);
  return new Uint8Array(buffer.subarray(0, bytesRead));
};

beforeAll(async () => {
  meta = JSON.parse(await readFile(metaPath, 'utf8')) as FixtureMeta;
  handle = await open(fixturePath, 'r');
});

afterAll(async () => {
  await handle.close();
});

describe('readBigTiffInfo', () => {
  it('liest Kopf und Georeferenzierung der echten BEV-Kachel', async () => {
    const info = await readBigTiffInfo(fileRange);
    expect(info.width).toBe(meta.width);
    expect(info.height).toBe(meta.height);
    expect(info.tileWidth).toBe(meta.tileWidth);
    expect(info.tileHeight).toBe(meta.tileWidth);
    expect(info.tileCols).toBe(meta.tileCols);
    expect(info.tileRows).toBe(meta.tileCols);
    expect(info.pixelSizeM).toBe(1);
    expect(info.originE).toBeCloseTo(meta.tiepoint[3], 3);
    expect(info.originN).toBeCloseTo(meta.tiepoint[4], 3);
    expect(info.nodata).toBe(meta.nodata);
    expect(info.tileOffsets).toHaveLength(meta.tileCount);
    expect(info.tileByteCounts).toHaveLength(meta.tileCount);
  });

  it('kommt mit wenigen Range-Requests aus', async () => {
    requests = 0;
    await readBigTiffInfo(fileRange);
    // Kopf plus die vier ausgelagerten Arrays — nicht die ganze Datei.
    expect(requests).toBeLessThanOrEqual(6);
  });
});

describe('readTile', () => {
  it('dekodiert die enthaltene Kachel auf die erwarteten Kennwerte', async () => {
    const info = await readBigTiffInfo(fileRange);
    const tile = await readTile(info, meta.tile.index, fileRange);
    expect(tile).toBeDefined();
    expect(tile).toHaveLength(meta.tile.pixels);

    const values = Array.from(tile as Float32Array).filter((v) => v > -9000);
    expect(values).toHaveLength(meta.tile.pixels);
    expect(Math.min(...values)).toBeCloseTo(meta.tile.minHeight, 4);
    expect(Math.max(...values)).toBeCloseTo(meta.tile.maxHeight, 4);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(meta.tile.meanHeight, 4);
    expect((tile as Float32Array)[0]).toBeCloseTo(meta.tile.firstValue, 3);
  });

  it('gibt undefined für Kacheln der Länge 0', async () => {
    const info = await readBigTiffInfo(fileRange);
    expect(await readTile(info, 0, fileRange)).toBeUndefined();
    expect(await readTile(info, meta.tileCount - 1, fileRange)).toBeUndefined();
  });

  it('gibt undefined für einen Index außerhalb des Verzeichnisses', async () => {
    const info = await readBigTiffInfo(fileRange);
    expect(await readTile(info, meta.tileCount + 10, fileRange)).toBeUndefined();
  });
});

describe('readBigTiffInfo lehnt nicht unterstützte Dateien ab', () => {
  const withBytes = (bytes: Uint8Array): FetchRange => async (from, to) => {
    const slice = bytes.subarray(from, Math.min(to + 1, bytes.length));
    const out = new Uint8Array(to - from + 1);
    out.set(slice);
    return out;
  };

  it('weist Big-Endian ab', async () => {
    const bytes = new Uint8Array(1024);
    bytes[0] = 0x4d;
    bytes[1] = 0x4d;
    await expect(readBigTiffInfo(withBytes(bytes))).rejects.toThrow(
      /little-endian/
    );
  });

  it('weist klassisches TIFF ab', async () => {
    const bytes = new Uint8Array(1024);
    bytes[0] = 0x49;
    bytes[1] = 0x49;
    bytes[2] = 42; // Version 42 = klassisch
    await expect(readBigTiffInfo(withBytes(bytes))).rejects.toThrow(
      /Version 43/
    );
  });
});

describe('lzwDecode', () => {
  it('überschreitet die erwartete Länge nicht', () => {
    // Zufällige Bytes ergeben irgendeine Folge, aber nie mehr als `expected`.
    const noise = new Uint8Array(512);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 37) % 256;
    expect(lzwDecode(noise, 64)).toHaveLength(64);
  });

  it('bricht bei zu kurzem Eingang ab statt zu überlaufen', () => {
    expect(lzwDecode(Uint8Array.of(0x80), 16)).toHaveLength(16);
    expect(lzwDecode(new Uint8Array(0), 16)).toHaveLength(16);
  });

  it('dekodiert echte Kacheldaten deterministisch', async () => {
    const info = await readBigTiffInfo(fileRange);
    const first = await readTile(info, meta.tile.index, fileRange);
    const second = await readTile(info, meta.tile.index, fileRange);
    expect(Array.from(first as Float32Array).slice(0, 32)).toEqual(
      Array.from(second as Float32Array).slice(0, 32)
    );
  });
});
