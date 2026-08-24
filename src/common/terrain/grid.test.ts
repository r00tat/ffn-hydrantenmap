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
  sourcePixelIndex,
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

  it('legt Zeile 0 auf die nördlichste Pixelmitte', () => {
    // Nicht auf `n + sizeM`: die Mitten spannen `[n, n + sizeM - res]`.
    expect(pixelInBlock({ e: 4834000, n: 2782999 }, block, 1)).toEqual({
      col: 0,
      row: 0,
    });
  });

  it('zählt Zeilen nach Süden bis zur Blockkante', () => {
    expect(pixelInBlock({ e: 4834000, n: 2782000 }, block, 1)).toEqual({
      col: 0,
      row: 999,
    });
  });

  it('ordnet jede Pixelmitte über blockForPoint demselben Block zu', () => {
    // Der Grund für die Südwest-Ausrichtung: mit `Math.floor` auf beiden
    // Achsen muss jede Pixelmitte in genau dem Block landen, dessen Zeilen
    // und Spalten sie enthalten. Mit der Nordwest-Ausrichtung fiel dabei die
    // Zeile auf `n + sizeM` durch — eine Rasterweite ohne Höhe je Blockgrenze.
    for (const col of [0, 1, 500, 999]) {
      for (const row of [0, 1, 500, 999]) {
        const center = blockPixelCenter(block, col, row, 1);
        const found = blockForPoint(center, 1000);
        expect(found).toEqual(block);
        expect(pixelInBlock(center, found, 1)).toEqual({ col, row });
      }
    }
  });

  it('ist über die Pixelmitte umkehrbar', () => {
    const center = blockPixelCenter(block, 123, 456, 1);
    const { col, row } = pixelInBlock(center, block, 1);
    expect(col).toBeCloseTo(123, 9);
    expect(row).toBeCloseTo(456, 9);
  });

  it('legt Pixelmitten auf ganze Meter, wie die BEV-Quelldaten', () => {
    // Der BEV-Tiepoint liegt bei 4799999.5, die Quellpixelmitten also auf
    // ganzen Metern. Läge unser Gitter um einen halben Pixel versetzt, fiele
    // jede Blockpixelmitte genau zwischen zwei Quellpixel.
    for (const col of [0, 1, 999]) {
      expect(blockPixelCenter(block, col, 0, 1).e % 1).toBe(0);
    }
  });

  it('pflastert lückenlos über die Blockgrenze', () => {
    const rechts = { e: block.e + 1000, n: block.n, sizeM: 1000 };
    const letztes = blockPixelCenter(block, 999, 0, 1);
    const erstes = blockPixelCenter(rechts, 0, 0, 1);
    expect(erstes.e - letztes.e).toBe(1);

    // Dasselbe nach Norden: letzte Zeile des oberen Blocks an erste Zeile
    // dieses Blocks.
    const oben = { e: block.e, n: block.n + 1000, sizeM: 1000 };
    expect(
      blockPixelCenter(oben, 0, 999, 1).n - blockPixelCenter(block, 0, 0, 1).n
    ).toBe(1);
  });
});

describe('sourcePixelIndex', () => {
  // Georeferenzierung der echten BEV-Kachel N2750000E4800000.
  const origin = { originE: 4_799_999.5, originN: 2_800_000.5, pixelSizeM: 1 };

  it('bildet die Ecke von Pixel (0,0) auf Index 0 ab', () => {
    expect(sourcePixelIndex({ e: 4_800_000, n: 2_800_000 }, origin)).toEqual({
      col: 0,
      row: 0,
    });
  });

  it('rundet Gleitkommarauschen weg statt es abzuschneiden', () => {
    const leichtDarunter = { e: 4_800_000 - 1e-9, n: 2_800_000 + 1e-9 };
    expect(sourcePixelIndex(leichtDarunter, origin)).toEqual({
      col: 0,
      row: 0,
    });
  });

  it('trifft den verifizierten Referenzpunkt', () => {
    const { col, row } = sourcePixelIndex(
      { e: 4_834_137.14, n: 2_782_474.81 },
      origin
    );
    expect(col).toBe(34137);
    expect(row).toBe(17525);
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
