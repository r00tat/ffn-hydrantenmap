import { describe, expect, it } from 'vitest';
import {
  BEV_TILE_COLS,
  bevPixel,
  bevSourceTile,
  bevSourceTileName,
  bevTileIndex,
  blockForPoint,
  blockId,
  blockPixelCenter,
  blocksForBounds,
  parseBlockId,
  pixelInBlock,
} from './grid';

describe('blockId / parseBlockId', () => {
  it('ist umkehrbar', () => {
    const ref = { e: 4834000, n: 2782000, sizeM: 1000 };
    expect(blockId(ref)).toBe('CRS3035RES1000mN2782000E4834000');
    expect(parseBlockId(blockId(ref))).toEqual(ref);
  });

  it('gibt undefined für fremde Namen', () => {
    expect(parseBlockId('kaputt')).toBeUndefined();
    expect(parseBlockId('CRS3857RES1000mN1E2')).toBeUndefined();
    expect(parseBlockId('CRS3035RES1000mN2782000E4834000.png')).toBeUndefined();
  });
});

describe('blockForPoint', () => {
  it('rundet auf die Blockkante ab', () => {
    expect(blockForPoint({ e: 4834137.17, n: 2782474.83 }, 1000)).toEqual({
      e: 4834000,
      n: 2782000,
      sizeM: 1000,
    });
  });

  it('ordnet einen Punkt genau auf der Kante dem Block zu, dessen Kante es ist', () => {
    expect(blockForPoint({ e: 4834000, n: 2782000 }, 1000)).toEqual({
      e: 4834000,
      n: 2782000,
      sizeM: 1000,
    });
  });
});

describe('pixelInBlock / blockPixelCenter', () => {
  const block = { e: 4834000, n: 2782000, sizeM: 1000 };

  it('setzt den Ursprung in die Nordwestecke', () => {
    expect(pixelInBlock({ e: 4834000, n: 2783000 }, block, 1)).toEqual({
      col: 0,
      row: 0,
    });
  });

  it('zählt Zeilen nach Süden', () => {
    expect(pixelInBlock({ e: 4834000, n: 2782000 }, block, 1)).toEqual({
      col: 0,
      row: 1000,
    });
  });

  it('ist über die Pixelmitte umkehrbar', () => {
    const center = blockPixelCenter(block, 123, 456, 1);
    const { col, row } = pixelInBlock(center, block, 1);
    expect(col).toBeCloseTo(123.5, 9);
    expect(row).toBeCloseTo(456.5, 9);
  });
});

describe('blocksForBounds', () => {
  it('deckt die Box vollständig ab', () => {
    const blocks = blocksForBounds(
      { eMin: 4834500, eMax: 4836500, nMin: 2782500, nMax: 2783500 },
      1000
    );
    expect(blocks).toHaveLength(6);
    const ids = blocks.map(blockId);
    expect(ids).toContain('CRS3035RES1000mN2782000E4834000');
    expect(ids).toContain('CRS3035RES1000mN2783000E4836000');
  });

  it('liefert für eine Box innerhalb eines Blocks genau einen Block', () => {
    expect(
      blocksForBounds(
        { eMin: 4834100, eMax: 4834900, nMin: 2782100, nMax: 2782900 },
        1000
      )
    ).toHaveLength(1);
  });
});

describe('BEV-Quellkacheln', () => {
  /**
   * Am 2026-08-24 gegen die echte Datei geprüft: dieser Punkt liegt in
   * `CRS3035RES50000mN2750000E4800000.tif`, interne Kachel Spalte 133 /
   * Zeile 68, also Index 13461 mit 206.990 Byte LZW-Daten.
   */
  const point = { e: 4834137.14, n: 2782474.81 };

  it('findet die 50-km-Kachel', () => {
    const tile = bevSourceTile(point);
    expect(tile).toEqual({ e: 4800000, n: 2750000, sizeM: 50000 });
    expect(bevSourceTileName(tile)).toBe(
      'CRS3035RES50000mN2750000E4800000.tif'
    );
  });

  it('rechnet die Pixelposition aus dem Tiepoint, nicht aus der Kachelkante', () => {
    const { col, row } = bevPixel(point, bevSourceTile(point));
    expect(Math.floor(col)).toBe(34137);
    expect(Math.floor(row)).toBe(17525);
  });

  it('findet die interne 256er-Kachel', () => {
    const index = bevTileIndex(point, bevSourceTile(point));
    expect(index).toBe(68 * BEV_TILE_COLS + 133);
    expect(index).toBe(13461);
  });

  it('hat ein 196x196-Kachelgitter', () => {
    expect(BEV_TILE_COLS).toBe(196);
  });
});
