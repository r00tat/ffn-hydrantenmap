import { describe, it, expect } from 'vitest';
import {
  detectDelimiter,
  detectHeaderRow,
  parseCsv,
  csvToRecords,
  parsePreHeaderMetadata,
  ColumnMapping,
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

describe('parsePreHeaderMetadata', () => {
  it('extracts a layer name from RadiaCode pre-header', () => {
    const lines = ['Track: 2026-03-27 08-48-01\tRC-110-004760\tTritolwerk\tEC'];
    const result = parsePreHeaderMetadata(lines, '\t');
    expect(result.suggestedName).toBe('Tritolwerk');
  });

  it('uses first field when no recognizable name found', () => {
    const lines = ['Some metadata line'];
    const result = parsePreHeaderMetadata(lines, '\t');
    expect(result.suggestedName).toBe('Some metadata line');
  });

  it('returns empty string for empty pre-header', () => {
    const result = parsePreHeaderMetadata([], '\t');
    expect(result.suggestedName).toBe('');
  });
});

describe('csvToRecords with column mapping', () => {
  const TSV_HEADERS = ['Timestamp', 'Time', 'Latitude', 'Longitude', 'Accuracy', 'DoseRate', 'CountRate', 'Comment'];
  const TSV_ROWS = [
    ['134190712898740000', '2026-03-27 07:48:09', '47.9484002', '16.8484409', '9.79', '5.36', '10.6', ' '],
  ];

  it('uses auto-detect when no mapping is provided', () => {
    const result = csvToRecords(TSV_HEADERS, TSV_ROWS);
    expect(result.latIndex).toBe(2); // Latitude
    expect(result.lngIndex).toBe(3); // Longitude
  });

  it('uses explicit mapping when provided', () => {
    const mapping: ColumnMapping = {
      latColumn: 2,
      lngColumn: 3,
      nameColumn: -1,
      timestampColumn: 1,
    };
    const result = csvToRecords(TSV_HEADERS, TSV_ROWS, mapping);
    expect(result.latIndex).toBe(2);
    expect(result.lngIndex).toBe(3);
    expect(result.nameIndex).toBe(-1);
    expect(result.timestampIndex).toBe(1);
    expect(result.records).toHaveLength(1);
  });

  it('respects excludedColumns and omits them from records', () => {
    const mapping: ColumnMapping = {
      latColumn: 2,
      lngColumn: 3,
      nameColumn: -1,
      timestampColumn: 1,
    };
    const excludedColumns = new Set([0, 4, 7]); // Timestamp(raw), Accuracy, Comment
    const result = csvToRecords(TSV_HEADERS, TSV_ROWS, mapping, excludedColumns);
    const record = result.records[0];
    expect(record['Accuracy']).toBeUndefined();
    expect(record['Comment']).toBeUndefined();
    expect(record['Timestamp']).toBeUndefined();
    expect(record['DoseRate']).toBe('5.36');
  });
});
