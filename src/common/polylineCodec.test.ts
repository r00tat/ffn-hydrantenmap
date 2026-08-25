import { describe, expect, it } from 'vitest';
import type { LatLngPosition } from './geo';
import { decodePolyline, encodePolyline } from './polylineCodec';

describe('polylineCodec', () => {
  it('läuft im Einsatzgebiet unter 0,11 m rund', () => {
    const ring: LatLngPosition[] = [
      [47.948312, 16.848221],
      [47.948401, 16.849102],
      [47.947998, 16.849511],
      [47.948312, 16.848221],
    ];
    const back = decodePolyline(encodePolyline(ring));
    expect(back).toHaveLength(ring.length);
    back.forEach(([lat, lng], index) => {
      // 1e-6 Grad sind 0,11 m in der Breite und 0,075 m in der Länge auf 48°.
      expect(Math.abs(lat - ring[index][0])).toBeLessThan(1e-6);
      expect(Math.abs(lng - ring[index][1])).toBeLessThan(1e-6);
    });
  });

  it('kodiert negative Werte', () => {
    const points: LatLngPosition[] = [
      [-33.868, 151.209],
      [-33.869, 151.208],
    ];
    const back = decodePolyline(encodePolyline(points));
    expect(back[0][0]).toBeCloseTo(-33.868, 6);
    expect(back[1][1]).toBeCloseTo(151.208, 6);
  });

  it('behandelt leer und einzelnen Punkt', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline(encodePolyline([[47.5, 16.5]]))).toHaveLength(1);
  });

  it('bricht bei abgeschnittener Eingabe ab, statt Unsinn zu liefern', () => {
    const encoded = encodePolyline([
      [47.948312, 16.848221],
      [47.948401, 16.849102],
    ]);
    // Letztes Zeichen weg: der zweite Punkt ist unvollständig.
    expect(decodePolyline(encoded.slice(0, -1))).toHaveLength(1);
  });
});
