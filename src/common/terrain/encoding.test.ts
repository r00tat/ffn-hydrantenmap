import { describe, expect, it } from 'vitest';
import {
  decodeHeight,
  encodeHeight,
  encodedToRgb,
  NODATA_ENCODED,
  rgbaToEncodedBlock,
  rgbToEncoded,
} from './encoding';

const detail = { base: 0, step: 0.05, nodataValue: NODATA_ENCODED };
const overview = { base: 0, step: 0.1, nodataValue: NODATA_ENCODED };

describe('encodeHeight / decodeHeight', () => {
  it('ist für Höhen im Wertebereich umkehrbar', () => {
    // 115,4 ist der Seespiegel des Neusiedler Sees, 884 der höchste Punkt
    // des Burgenlands — der Wertebereich, der tatsächlich vorkommt.
    for (const h of [0, 115.4, 116.25, 173.6, 884]) {
      expect(decodeHeight(encodeHeight(h, detail), detail)).toBeCloseTo(h, 2);
    }
  });

  it('quantisiert auf die Schrittweite', () => {
    expect(decodeHeight(encodeHeight(115.43, detail), detail)).toBeCloseTo(
      115.45,
      6
    );
    expect(decodeHeight(encodeHeight(115.43, overview), overview)).toBeCloseTo(
      115.4,
      6
    );
  });

  it('bildet undefined und nicht endliche Werte auf nodata ab', () => {
    expect(encodeHeight(undefined, detail)).toBe(NODATA_ENCODED);
    expect(encodeHeight(Number.NaN, detail)).toBe(NODATA_ENCODED);
    expect(encodeHeight(Number.POSITIVE_INFINITY, detail)).toBe(NODATA_ENCODED);
    expect(decodeHeight(NODATA_ENCODED, detail)).toBeUndefined();
  });

  it('bildet Werte außerhalb des Bereichs auf nodata ab, nicht auf 0', () => {
    // -9999 ist der nodata-Wert der BEV-Quelldaten. Würde er zu 0 m, wäre im
    // Wasserstandsmodell alles ohne Daten überflutet.
    expect(encodeHeight(-9999, detail)).toBe(NODATA_ENCODED);
    expect(encodeHeight(-1, detail)).toBe(NODATA_ENCODED);
    expect(encodeHeight(1e9, detail)).toBe(NODATA_ENCODED);
  });

  it('lässt den höchsten darstellbaren Wert unterhalb von nodata', () => {
    const höchste = (NODATA_ENCODED - 1) * detail.step;
    expect(encodeHeight(höchste, detail)).toBe(NODATA_ENCODED - 1);
    expect(decodeHeight(NODATA_ENCODED - 1, detail)).toBeCloseTo(höchste, 6);
  });
});

describe('RGB-Kodierung', () => {
  it('ist zwischen RGB und kodiertem Wert umkehrbar', () => {
    for (const v of [0, 1, 255, 256, 65535, 65536, 0xfffffe, 0xffffff]) {
      expect(rgbToEncoded(...encodedToRgb(v))).toBe(v);
    }
  });

  it('legt nodata auf reines Weiß', () => {
    expect(encodedToRgb(NODATA_ENCODED)).toEqual([255, 255, 255]);
  });

  it('verwirft den Alphakanal beim Blocklesen', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 0, 0, 0, 4, 255]);
    expect(Array.from(rgbaToEncodedBlock(rgba, 2))).toEqual([
      rgbToEncoded(1, 2, 3),
      rgbToEncoded(0, 0, 4),
    ]);
  });

  it('liest einen Block über Höhen hinweg verlustfrei', () => {
    const höhen = [115.4, 116.25, 173.6, undefined];
    const rgba = new Uint8ClampedArray(höhen.length * 4);
    höhen.forEach((h, i) => {
      const [r, g, b] = encodedToRgb(encodeHeight(h, detail));
      rgba.set([r, g, b, 255], i * 4);
    });
    const encoded = rgbaToEncodedBlock(rgba, höhen.length);
    expect(decodeHeight(encoded[0], detail)).toBeCloseTo(115.4, 2);
    expect(decodeHeight(encoded[1], detail)).toBeCloseTo(116.25, 2);
    expect(decodeHeight(encoded[2], detail)).toBeCloseTo(173.6, 2);
    expect(decodeHeight(encoded[3], detail)).toBeUndefined();
  });
});
