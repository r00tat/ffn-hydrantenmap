import { describe, it, expect } from 'vitest';
import { convertCoordinates, type ConvertedHydrantRow } from './hydrantenCsvConverter';
import type { ParsedHydrantRow } from './hydrantenCsvParser';

describe('convertCoordinates', () => {
  it('converts GK M34 to WGS84 and computes geohash', () => {
    const input: ParsedHydrantRow[] = [{
      ortschaft: 'Neusiedl',
      typ: 'Überflurhydrant',
      hydranten_nummer: 'HY1',
      fuellhydrant: 'NEIN',
      dimension: 80,
      leitungsart: 'Endstrang',
      statischer_druck: 5.6,
      dynamischer_druck: 4,
      druckmessung_datum: '17/10/2024',
      meereshoehe: 116.52,
      raw_x: 37648.217,
      raw_y: 310270.421,
      documentKey: 'neusiedl_hy1',
    }];

    const result = convertCoordinates(input);
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBeCloseTo(47.92995, 4);
    expect(result[0].lng).toBeCloseTo(16.83597, 4);
    expect(result[0].geohash).toBeDefined();
    expect(result[0].geohash).toHaveLength(6);
    expect(result[0].name).toBe('neusiedl_hy1');
  });

  it('filters out rows with invalid coordinates', () => {
    const input: ParsedHydrantRow[] = [{
      ortschaft: 'Test',
      typ: 'Überflurhydrant',
      hydranten_nummer: 'HY1',
      fuellhydrant: 'NEIN',
      dimension: 80,
      leitungsart: 'Endstrang',
      statischer_druck: 0,
      dynamischer_druck: 0,
      druckmessung_datum: '',
      meereshoehe: 0,
      raw_x: NaN,
      raw_y: NaN,
      documentKey: 'test_hy1',
    }];

    const result = convertCoordinates(input);
    expect(result).toHaveLength(0);
  });
});
