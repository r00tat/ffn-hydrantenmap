import { describe, expect, it } from 'vitest';
import { adriaOffsetLookup, encodeAdriaOffsets } from './adriaOffset';
import type { AdriaOffsetGrid } from './terrainIndexTypes';

/**
 * Ein 3×3-Gitter mit einem Nord-Süd-Verlauf wie im echten Burgenland: der
 * Zuschlag wächst nach Norden. Zeilen laufen von Süd nach Nord.
 */
const grid = (): AdriaOffsetGrid => {
  const offsetsMm = [
    364, 364, 364, // Süd
    404, 404, 404,
    443, 443, 443, // Nord
  ];
  return {
    latMin: 46.9,
    lonMin: 16.1,
    latStep: 0.5,
    lonStep: 0.5,
    meanM: 0.404,
    minM: 0.364,
    maxM: 0.443,
    sourcePoints: 9,
    ...encodeAdriaOffsets(offsetsMm, 3, 3),
  };
};

describe('encodeAdriaOffsets', () => {
  it('kodiert Millimeter verlustfrei in ein Byte je Zelle', () => {
    const encoded = encodeAdriaOffsets([337, 400, 487], 3, 1);
    expect(encoded.baseMm).toBe(337);
    const lookup = adriaOffsetLookup({
      latMin: 0,
      lonMin: 0,
      latStep: 1,
      lonStep: 1,
      meanM: 0,
      minM: 0,
      maxM: 0,
      sourcePoints: 3,
      ...encoded,
    });
    expect(lookup.offsetAt([0, 0])).toBeCloseTo(0.337, 6);
    expect(lookup.offsetAt([0, 2])).toBeCloseTo(0.487, 6);
  });

  it('weist eine Spanne ab, die nicht in ein Byte passt', () => {
    expect(() => encodeAdriaOffsets([0, 300], 2, 1)).toThrow(/nicht in ein Byte/);
  });
});

describe('adriaOffsetLookup', () => {
  it('trifft die Gitterpunkte genau', () => {
    const lookup = adriaOffsetLookup(grid());
    expect(lookup.offsetAt([46.9, 16.1])).toBeCloseTo(0.364, 6);
    expect(lookup.offsetAt([47.9, 16.1])).toBeCloseTo(0.443, 6);
  });

  it('interpoliert zwischen den Zeilen', () => {
    const lookup = adriaOffsetLookup(grid());
    // Genau zwischen Süd (364) und Mitte (404).
    expect(lookup.offsetAt([47.15, 16.1])).toBeCloseTo(0.384, 3);
  });

  it('gibt außerhalb des Gitters undefined', () => {
    const lookup = adriaOffsetLookup(grid());
    expect(lookup.offsetAt([40, 16.1])).toBeUndefined();
    expect(lookup.offsetAt([46.9, 10])).toBeUndefined();
  });

  it('klemmt am Gitterrand statt zu mitteln', () => {
    const lookup = adriaOffsetLookup(grid());
    // Genau auf der Nordostecke: beide Nachbarzellen fehlen. Ein Mittelwert
    // über die vorhandenen Ecken würde den Wert verschieben.
    expect(lookup.offsetAt([47.9, 17.1])).toBeCloseTo(0.443, 6);
  });

  it('trägt eine halbe Zelle Zugabe über den Gitterrand hinaus', () => {
    const lookup = adriaOffsetLookup(grid());
    expect(lookup.offsetAt([48.0, 16.1])).toBeCloseTo(0.443, 6);
    expect(lookup.offsetAt([48.3, 16.1])).toBeUndefined();
  });

  it('bildet den Nord-Süd-Trend des Burgenlands ab', () => {
    const lookup = adriaOffsetLookup(grid());
    const nord = lookup.offsetAt([47.9, 16.6]) as number;
    const sued = lookup.offsetAt([46.9, 16.6]) as number;
    // Ein Festwert hätte diesen Unterschied von 8 cm verschluckt.
    expect(nord - sued).toBeCloseTo(0.079, 3);
  });
});
