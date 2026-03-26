import { describe, it, expect } from 'vitest';
import { matchHydranten, type MatchResult, type ExistingHydrant } from './hydrantenMatcher';
import type { ConvertedHydrantRow } from './hydrantenCsvConverter';

function makeRow(overrides: Partial<ConvertedHydrantRow>): ConvertedHydrantRow {
  return {
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
    lat: 47.92995,
    lng: 16.83597,
    geohash: 'u2ekkj',
    name: 'neusiedl_hy1',
    documentKey: 'neusiedl_hy1',
    ...overrides,
  };
}

describe('matchHydranten', () => {
  it('marks new records when no existing data', () => {
    const rows = [makeRow({})];
    const result = matchHydranten(rows, []);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('new');
    expect(result[0].duplicateDocId).toBeUndefined();
  });

  it('marks update when same key exists', () => {
    const rows = [makeRow({})];
    const existing: ExistingHydrant[] = [{
      id: 'neusiedl_hy1',
      ortschaft: 'Neusiedl',
      hydranten_nummer: 'HY1',
      leistung: 1074,
    }];
    const result = matchHydranten(rows, existing);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('update');
    expect(result[0].preservedFields).toEqual({ leistung: 1074 });
  });

  it('detects duplicate when alias key exists (ND vs Neusiedl)', () => {
    const rows = [makeRow({})];
    const existing: ExistingHydrant[] = [{
      id: 'ndhy1',
      ortschaft: 'ND',
      hydranten_nummer: 'HY1',
      leistung: 1074,
    }];
    const result = matchHydranten(rows, existing);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('update');
    expect(result[0].duplicateDocId).toBe('ndhy1');
    expect(result[0].preservedFields).toEqual({ leistung: 1074 });
  });

  it('preserves leistung from existing record', () => {
    const rows = [makeRow({})];
    const existing: ExistingHydrant[] = [{
      id: 'neusiedl_hy1',
      ortschaft: 'Neusiedl',
      hydranten_nummer: 'HY1',
      leistung: 1074,
    }];
    const result = matchHydranten(rows, existing);
    expect(result[0].preservedFields).toEqual({ leistung: 1074 });
  });

  it('does not preserve leistung if not present in existing', () => {
    const rows = [makeRow({})];
    const existing: ExistingHydrant[] = [{
      id: 'neusiedl_hy1',
      ortschaft: 'Neusiedl',
      hydranten_nummer: 'HY1',
    }];
    const result = matchHydranten(rows, existing);
    expect(result[0].preservedFields).toEqual({});
  });
});
