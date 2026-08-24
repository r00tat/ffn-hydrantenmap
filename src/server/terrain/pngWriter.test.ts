import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NODATA_ENCODED } from '../../common/terrain/encoding';
import { readTerrainPng, writeTerrainPng } from './pngWriter';

const detail = { base: 0, step: 0.05, nodataValue: NODATA_ENCODED };
let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'terrain-png-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeTerrainPng', () => {
  it('schreibt Höhen verlustfrei bis auf die Quantisierung', async () => {
    const heights = Float32Array.from([115.4, 116.25, 173.6, Number.NaN]);
    const target = path.join(dir, 'block.png');
    await writeTerrainPng(heights, 2, detail, target);

    const { heights: back, sizePx } = await readTerrainPng(target, detail);
    expect(sizePx).toBe(2);
    expect(back[0]).toBeCloseTo(115.4, 2);
    expect(back[1]).toBeCloseTo(116.25, 2);
    expect(back[2]).toBeCloseTo(173.6, 2);
    expect(Number.isNaN(back[3])).toBe(true);
  });

  it('schreibt kein Farbprofil und keine Gamma-Angabe', async () => {
    const target = path.join(dir, 'noicc.png');
    await writeTerrainPng(Float32Array.from([1, 2, 3, 4]), 2, detail, target);
    const bytes = await readFile(target);
    // Mit Farbprofil dürfte der Browser die Kanalwerte umrechnen — dann
    // stimmen die Höhen nicht mehr.
    expect(bytes.includes(Buffer.from('iCCP'))).toBe(false);
    expect(bytes.includes(Buffer.from('gAMA'))).toBe(false);
    expect(bytes.includes(Buffer.from('sRGB'))).toBe(false);
  });

  it('weist eine unpassende Blockgröße ab', async () => {
    await expect(
      writeTerrainPng(
        Float32Array.from([1, 2, 3]),
        2,
        detail,
        path.join(dir, 'nope.png')
      )
    ).rejects.toThrow(/passen nicht/);
  });

  it('bleibt bei einem realistischen Block in der erwarteten Größenordnung', async () => {
    // 256 × 256 bei 1 m mit einem sanften Hang — die gemessenen 2,58 bit/Zelle
    // an echten Daten entsprechen etwa 21 KB für diese Größe. Ein glatter Hang
    // komprimiert besser, deshalb nur eine Obergrenze.
    const sizePx = 256;
    const heights = new Float32Array(sizePx * sizePx);
    for (let row = 0; row < sizePx; row += 1) {
      for (let col = 0; col < sizePx; col += 1) {
        heights[row * sizePx + col] = 115 + col * 0.05 + row * 0.02;
      }
    }
    const target = path.join(dir, 'hang.png');
    await writeTerrainPng(heights, sizePx, detail, target);
    const { size } = await stat(target);
    expect(size).toBeLessThan(64 * 1024);

    const { heights: back } = await readTerrainPng(target, detail);
    expect(back[0]).toBeCloseTo(115, 2);
    expect(back[sizePx * sizePx - 1]).toBeCloseTo(
      115 + 255 * 0.05 + 255 * 0.02,
      2
    );
  });

  it('hält den nodata-Wert über den PNG-Umweg', async () => {
    const heights = new Float32Array(16).fill(Number.NaN);
    heights[5] = 200;
    const target = path.join(dir, 'nodata.png');
    await writeTerrainPng(heights, 4, detail, target);
    const { heights: back } = await readTerrainPng(target, detail);
    expect(back.filter((v) => !Number.isNaN(v))).toHaveLength(1);
    expect(back[5]).toBeCloseTo(200, 2);
  });
});
