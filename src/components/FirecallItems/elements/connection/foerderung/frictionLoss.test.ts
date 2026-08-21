import { describe, expect, it } from 'vitest';
import {
  frictionLossPer100m,
  hoseInnerDiameterMm,
  isTabulatedDimension,
} from './frictionLoss';

describe('hoseInnerDiameterMm', () => {
  it('erkennt die Kurzbezeichnungen', () => {
    expect(hoseInnerDiameterMm('B')).toBe(75);
    expect(hoseInnerDiameterMm('b')).toBe(75);
    expect(hoseInnerDiameterMm('A')).toBe(110);
    expect(hoseInnerDiameterMm('C')).toBe(52);
    expect(hoseInnerDiameterMm('D')).toBe(25);
    expect(hoseInnerDiameterMm('F')).toBe(152);
  });

  it('erkennt die Schreibweisen mit ausgeschriebenem Durchmesser', () => {
    expect(hoseInnerDiameterMm('C 42')).toBe(42);
    expect(hoseInnerDiameterMm('C-42')).toBe(42);
    expect(hoseInnerDiameterMm('C42')).toBe(42);
    expect(hoseInnerDiameterMm('B 75')).toBe(75);
  });

  it('gibt undefined für Unbekanntes', () => {
    expect(hoseInnerDiameterMm('X')).toBeUndefined();
    expect(hoseInnerDiameterMm('Storz')).toBeUndefined();
    expect(hoseInnerDiameterMm('')).toBeUndefined();
    expect(hoseInnerDiameterMm(undefined)).toBeUndefined();
  });
});

describe('frictionLossPer100m für B 75', () => {
  // Die belegte Tabelle: FF Ebersdorf, „Tabellen für Löschwasserförderung",
  // Stand 07/2020. Diese sieben Werte müssen exakt stimmen — sie sind die
  // Zahlen, mit denen ausgebildet wird.
  it.each([
    [200, 0.1],
    [400, 0.25],
    [600, 0.5],
    [800, 1.0],
    [1000, 1.5],
    [1200, 2.5],
    [1600, 5.0],
  ])('gibt bei %i l/min den Tabellenwert %f zurück', (flow, expected) => {
    expect(frictionLossPer100m(flow, 'B')).toBeCloseTo(expected, 6);
  });

  it('interpoliert zwischen den Stützstellen über Q²', () => {
    // (900² − 800²) / (1000² − 800²) = 0,4722 → 1,00 + 0,50 · 0,4722
    expect(frictionLossPer100m(900, 'B')).toBeCloseTo(1.2361, 3);
  });

  it('bleibt bei der Interpolation zwischen den Nachbarwerten', () => {
    for (const flow of [300, 500, 700, 900, 1100, 1400]) {
      const value = frictionLossPer100m(flow, 'B') as number;
      expect(value).toBeGreaterThan(frictionLossPer100m(flow - 100, 'B') as number);
      expect(value).toBeLessThan(frictionLossPer100m(flow + 100, 'B') as number);
    }
  });

  it('extrapoliert über der letzten Stützstelle mit Q²', () => {
    // 5,00 · (2000/1600)²
    expect(frictionLossPer100m(2000, 'B')).toBeCloseTo(7.8125, 4);
  });

  it('extrapoliert unter der ersten Stützstelle mit Q²', () => {
    // 0,10 · (100/200)²
    expect(frictionLossPer100m(100, 'B')).toBeCloseTo(0.025, 4);
  });

  it('ist bei Menge 0 verlustfrei', () => {
    expect(frictionLossPer100m(0, 'B')).toBe(0);
  });
});

describe('frictionLossPer100m für andere Dimensionen', () => {
  it('skaliert C 52 mit (75/52)^5', () => {
    // 1,00 · 6,2413
    expect(frictionLossPer100m(800, 'C')).toBeCloseTo(6.2413, 2);
  });

  it('bleibt bei C 52 in der Nähe des veröffentlichten Werts von 6,5', () => {
    // Gegenprüfung gegen die deutsche Literatur: dort 6,5 bar/100 m bei
    // 800 l/min. Die Ableitung darf nicht mehr als 15 % daneben liegen.
    const value = frictionLossPer100m(800, 'C') as number;
    expect(value).toBeGreaterThan(6.5 * 0.85);
    expect(value).toBeLessThan(6.5 * 1.15);
  });

  it('macht A 110 deutlich verlustärmer als B 75', () => {
    const a = frictionLossPer100m(1000, 'A') as number;
    expect(a).toBeGreaterThan(0.15);
    expect(a).toBeLessThan(0.35);
    expect(a).toBeLessThan(frictionLossPer100m(1000, 'B') as number);
  });

  it('macht C 42 verlustreicher als C 52', () => {
    expect(frictionLossPer100m(400, 'C 42') as number).toBeGreaterThan(
      frictionLossPer100m(400, 'C') as number
    );
  });

  it('gibt undefined für eine Dimension ohne bekannten Durchmesser', () => {
    expect(frictionLossPer100m(800, 'X')).toBeUndefined();
    expect(frictionLossPer100m(800, undefined)).toBeUndefined();
  });
});

describe('isTabulatedDimension', () => {
  it('gilt nur für B 75', () => {
    expect(isTabulatedDimension('B')).toBe(true);
    expect(isTabulatedDimension('B 75')).toBe(true);
    expect(isTabulatedDimension('C')).toBe(false);
    expect(isTabulatedDimension('A')).toBe(false);
    expect(isTabulatedDimension(undefined)).toBe(false);
  });
});
