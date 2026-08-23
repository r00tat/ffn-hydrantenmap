import { describe, expect, it } from 'vitest';
import {
  SAECKE_JE_METER,
  VERLEGE_LEISTUNG,
  inTabelle,
  saeckeJeMeter,
} from './saeckeJeMeter';

describe('saeckeJeMeter', () => {
  it('trifft die Stützstellen der Lehrunterlage genau', () => {
    for (const { hoehe, saecke } of SAECKE_JE_METER) {
      expect(saeckeJeMeter(hoehe)).toBeCloseTo(saecke, 6);
    }
  });

  it('interpoliert in h² zwischen den Zeilen', () => {
    // Zwischen 1,0 m (120) und 1,5 m (275): bei 1,25 m ist h² = 1,5625,
    // Anteil (1,5625 − 1) / (2,25 − 1) = 0,45
    expect(saeckeJeMeter(1.25)).toBeCloseTo(120 + 155 * 0.45, 6);
  });

  it('liegt zwischen den Stützstellen über der linearen Interpolation', () => {
    // Quadratisch heißt: der Zuwachs kommt später. Linear in h wären es bei
    // 0,75 m 80 Säcke.
    expect(saeckeJeMeter(0.75)).toBeLessThan(80);
    expect(saeckeJeMeter(0.75)).toBeGreaterThan(40);
  });

  it('führt unter der Tabelle auf null hinunter', () => {
    expect(saeckeJeMeter(0)).toBe(0);
    expect(saeckeJeMeter(-1)).toBe(0);
    // 0,3 m: 40 × (0,09 / 0,25)
    expect(saeckeJeMeter(0.3)).toBeCloseTo(14.4, 6);
  });

  it('wächst streng monoton', () => {
    let vorher = 0;
    for (let h = 0.1; h <= 2.5; h += 0.1) {
      const wert = saeckeJeMeter(h);
      expect(wert).toBeGreaterThan(vorher);
      vorher = wert;
    }
  });

  it('extrapoliert über der Tabelle mit der Steigung des letzten Abschnitts', () => {
    // Steigung je h² zwischen 1,5 und 2,0: (500 − 275) / (4 − 2,25) = 128,57
    expect(saeckeJeMeter(2.5)).toBeCloseTo(500 + (6.25 - 4) * (225 / 1.75), 4);
  });

  it('weist aus, wo die Tabelle endet', () => {
    expect(inTabelle(1)).toBe(true);
    expect(inTabelle(2)).toBe(true);
    expect(inTabelle(2.1)).toBe(false);
    expect(inTabelle(0)).toBe(false);
  });
});

describe('VERLEGE_LEISTUNG', () => {
  it('folgt aus der Zeitzeile der Tabelle', () => {
    // Rund 0,75 Personenminuten je Sack über alle vier Höhen: die beiden
    // ersten Zeilen genau 80 Säcke/h, die beiden anderen 78,6 und 79,0 — die
    // Streuung ist die Rundung der Tabelle selbst.
    for (const { saecke, minutenBei10 } of SAECKE_JE_METER) {
      const personenminutenJeSack = (minutenBei10 * 10) / saecke;
      expect(
        Math.abs(60 / personenminutenJeSack - VERLEGE_LEISTUNG)
      ).toBeLessThan(2);
    }
  });
});
