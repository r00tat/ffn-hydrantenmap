import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  detectHeaderRow,
  parseCsv,
} from './csvParser';

const RADIACODE_TSV = [
  'Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC',
  'Timestamp\tTime\tLatitude\tLongitude\tAccuracy\tDoseRate\tCountRate\tComment',
  '134190712898740000\t2026-03-27 07:48:09\t47.9484002\t16.8484409\t9.79\t5.36\t10.6\t ',
  '134190712900590000\t2026-03-27 07:48:10\t47.9484018\t16.8484379\t9.12\t5.36\t10.6\t ',
].join('\n');

const SIMPLE_CSV = [
  'lat,lng,name',
  '47.9,16.8,Punkt 1',
  '47.8,16.7,Punkt 2',
].join('\n');

describe('detectHeaderRow', () => {
  it('returns 0 for a standard CSV where line 1 is the header', () => {
    expect(detectHeaderRow(SIMPLE_CSV, ',')).toBe(0);
  });

  it('returns 1 when line 1 has fewer delimiters than line 2 (RadiaCode TSV)', () => {
    expect(detectHeaderRow(RADIACODE_TSV, '\t')).toBe(1);
  });

  it('returns 0 for empty text', () => {
    expect(detectHeaderRow('', '\t')).toBe(0);
  });

  it('returns 0 for single-line text', () => {
    expect(detectHeaderRow('a\tb\tc', '\t')).toBe(0);
  });
});

describe('parseCsv with headerRow', () => {
  it('uses line 1 as header by default (headerRow=0)', () => {
    const result = parseCsv(SIMPLE_CSV, ',', 0);
    expect(result.headers).toEqual(['lat', 'lng', 'name']);
    expect(result.rows).toHaveLength(2);
    expect(result.preHeaderLines).toEqual([]);
  });

  it('uses line 2 as header when headerRow=1', () => {
    const result = parseCsv(RADIACODE_TSV, '\t', 1);
    expect(result.headers).toEqual([
      'Timestamp', 'Time', 'Latitude', 'Longitude',
      'Accuracy', 'DoseRate', 'CountRate', 'Comment',
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.preHeaderLines).toEqual([
      'Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC',
    ]);
  });

  it('returns empty result when headerRow exceeds line count', () => {
    const result = parseCsv(SIMPLE_CSV, ',', 99);
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.preHeaderLines).toHaveLength(3);
  });
});

describe('detectDelimiter', () => {
  it('detects tab as delimiter for RadiaCode TSV', () => {
    expect(detectDelimiter(RADIACODE_TSV)).toBe('\t');
  });

  it('detects comma for simple CSV', () => {
    expect(detectDelimiter(SIMPLE_CSV)).toBe(',');
  });
});
