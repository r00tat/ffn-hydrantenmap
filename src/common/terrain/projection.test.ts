import { describe, expect, it } from 'vitest';
import { laeaToWgs84, wgs84ToLaea } from './projection';

describe('projection', () => {
  it('rechnet Neusiedl am See nach EPSG:3035', () => {
    const { e, n } = wgs84ToLaea([47.949, 16.842]);
    expect(e).toBeCloseTo(4831532.79, 1);
    expect(n).toBeCloseTo(2783144.61, 1);
  });

  /**
   * Der Punkt, mit dem die Kachelzuordnung gegen die echte BEV-Datei geprüft
   * wurde: er liegt in `CRS3035RES50000mN2750000E4800000.tif`, dort in der
   * internen Kachel 13461. Siehe `grid.test.ts`.
   */
  it('trifft den verifizierten Referenzpunkt der BEV-Kachelprobe', () => {
    const { e, n } = wgs84ToLaea([47.94083, 16.875914]);
    expect(e).toBeCloseTo(4834137.14, 1);
    expect(n).toBeCloseTo(2782474.81, 1);
  });

  it('ist umkehrbar', () => {
    // 1e-7 Grad sind etwa 1 cm — feiner als die Höhendaten je sein werden.
    const start: [number, number] = [47.9482913, 16.848222];
    const [lat, lng] = laeaToWgs84(wgs84ToLaea(start));
    expect(lat).toBeCloseTo(start[0], 7);
    expect(lng).toBeCloseTo(start[1], 7);
  });

  it('liefert für den Projektionsursprung die Verschiebungswerte', () => {
    const { e, n } = wgs84ToLaea([52, 10]);
    expect(e).toBeCloseTo(4321000, 3);
    expect(n).toBeCloseTo(3210000, 3);
  });
});
