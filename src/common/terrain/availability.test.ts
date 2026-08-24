import { describe, expect, it } from 'vitest';
import {
  availableBlocks,
  decodeAvailability,
  encodeAvailability,
  hasBlock,
} from './availability';
import { blockId } from './grid';
import type { TerrainLevel } from './terrainIndexTypes';

const level: TerrainLevel = {
  id: 'detail',
  resolutionM: 1,
  blockPx: 1000,
  blockSizeM: 1000,
  base: 0,
  step: 0.05,
  nodataValue: 0xffffff,
  pathTemplate: 'detail/CRS3035RES1000mN{n}E{e}.png',
  bounds: { eMin: 4780000, eMax: 4850000, nMin: 2650000, nMax: 2805000 },
  availability: { cols: 0, rows: 0, bits: '' },
};

const cols = (level.bounds.eMax - level.bounds.eMin) / level.blockSizeM;
const rows = (level.bounds.nMax - level.bounds.nMin) / level.blockSizeM;

describe('availability', () => {
  it('ist zwischen Erzeuger und Leser umkehrbar', () => {
    const gesetzt = new Set(['0,0', '3,1', '6,4']);
    const encoded = encodeAvailability(7, 5, (col, row) =>
      gesetzt.has(`${col},${row}`)
    );
    const lookup = decodeAvailability(encoded);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        expect(lookup.hasCell(col, row)).toBe(gesetzt.has(`${col},${row}`));
      }
    }
    expect(lookup.count()).toBe(gesetzt.size);
  });

  it('packt durchgehend ohne Zeilenpadding', () => {
    // 7 * 5 = 35 Bit ⇒ 5 Byte. Mit Zeilenpadding wäre je Zeile ein Byte,
    // also 5 Byte für 5 Zeilen à 7 Bit — dieselbe Zahl. Deshalb zusätzlich ein
    // Fall, in dem sich die beiden Packungen unterscheiden:
    expect(Buffer.from(encodeAvailability(7, 5, () => true).bits, 'base64')).toHaveLength(5);
    // 9 * 3 = 27 Bit ⇒ 4 Byte durchgehend, aber 6 Byte mit Zeilenpadding.
    expect(Buffer.from(encodeAvailability(9, 3, () => true).bits, 'base64')).toHaveLength(4);
  });

  it('nutzt MSB-first', () => {
    const encoded = encodeAvailability(8, 1, (col) => col === 0);
    expect(Buffer.from(encoded.bits, 'base64')[0]).toBe(0x80);
    const letztes = encodeAvailability(8, 1, (col) => col === 7);
    expect(Buffer.from(letztes.bits, 'base64')[0]).toBe(0x01);
  });

  it('legt Zeilen hintereinander, nicht Spalten', () => {
    // Zelle (0, 1) ist Bit 9 bei cols = 9 ⇒ zweites Byte, oberstes Bit.
    const encoded = encodeAvailability(9, 3, (col, row) => col === 0 && row === 1);
    const bytes = Buffer.from(encoded.bits, 'base64');
    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x40);
  });

  it('gibt für Abfragen außerhalb des Gitters false', () => {
    const lookup = decodeAvailability(encodeAvailability(4, 4, () => true));
    expect(lookup.hasCell(-1, 0)).toBe(false);
    expect(lookup.hasCell(0, -1)).toBe(false);
    expect(lookup.hasCell(4, 0)).toBe(false);
    expect(lookup.hasCell(0, 4)).toBe(false);
  });
});

describe('hasBlock', () => {
  const withBits: TerrainLevel = {
    ...level,
    availability: encodeAvailability(cols, rows, () => true),
  };
  const lookup = decodeAvailability(withBits.availability);

  it('bildet alle vier Ecken der Bounding-Box korrekt ab', () => {
    for (const e of [level.bounds.eMin, level.bounds.eMax - 1000]) {
      for (const n of [level.bounds.nMin, level.bounds.nMax - 1000]) {
        expect(hasBlock(withBits, lookup, { e, n, sizeM: 1000 })).toBe(true);
      }
    }
  });

  it('gibt für einen Block außerhalb der Box false', () => {
    expect(
      hasBlock(withBits, lookup, {
        e: level.bounds.eMax,
        n: level.bounds.nMin,
        sizeM: 1000,
      })
    ).toBe(false);
  });

  it('rundet eine nicht auf dem Gitter liegende Position nicht, sondern verneint', () => {
    expect(
      hasBlock(withBits, lookup, {
        e: level.bounds.eMin + 500,
        n: level.bounds.nMin,
        sizeM: 1000,
      })
    ).toBe(false);
  });
});

describe('availableBlocks', () => {
  it('listet genau die gesetzten Blöcke als Offline-Manifest', () => {
    const availability = encodeAvailability(
      cols,
      rows,
      (col, row) => (col === 0 && row === 0) || (col === 2 && row === 3)
    );
    const blocks = availableBlocks({ ...level, availability });
    expect(blocks.map(blockId)).toEqual([
      'CRS3035RES1000mN2650000E4780000',
      'CRS3035RES1000mN2653000E4782000',
    ]);
  });
});
