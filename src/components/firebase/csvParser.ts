import {
  coerceValue,
  findColumn,
  KNOWN_LAT_NAMES,
  KNOWN_LNG_NAMES,
  KNOWN_NAME_NAMES,
  KNOWN_TIMESTAMP_NAMES,
} from './importUtils';
import { DataSchemaField, FirecallItem } from './firestore';

export type Delimiter = ',' | ';' | '\t';

/**
 * Count occurrences of a delimiter in a single line.
 */
function countDelimiter(line: string, delimiter: string): number {
  return (line.match(new RegExp(delimiter === '\t' ? '\\t' : delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

/**
 * Detect the most likely delimiter by counting occurrences in the first 3
 * non-empty lines and picking the line with the most delimiters for counting.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')
    .slice(0, 3);

  const delimiters: Delimiter[] = [',', ';', '\t'];
  const totals: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };

  for (const d of delimiters) {
    // Use the max count across the first few lines
    for (const line of lines) {
      const c = countDelimiter(line, d);
      if (c > totals[d]) totals[d] = c;
    }
  }

  // Pick delimiter with highest count; default to ','
  return (
    (Object.entries(totals) as [Delimiter, number][]).sort(
      (a, b) => b[1] - a[1]
    )[0][0] || ','
  );
}

/**
 * Detect which line is the header row.
 * If line 0 has significantly fewer delimiters than line 1 (less than half),
 * returns 1 (header is on line 1). Otherwise returns 0.
 */
export function detectHeaderRow(text: string, delimiter: string): number {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');

  if (lines.length < 2) return 0;

  const count0 = countDelimiter(lines[0], delimiter);
  const count1 = countDelimiter(lines[1], delimiter);

  // If line 0 has less than half the delimiters of line 1, it's metadata
  if (count1 > 0 && count0 < count1 / 2) return 1;

  return 0;
}

/**
 * Parse CSV text into headers and rows.
 * Strips trailing empty columns from headers.
 *
 * @param headerRow - Zero-based index of the header line (default 0).
 *   Lines before headerRow are returned as `preHeaderLines`.
 */
export function parseCsv(
  text: string,
  delimiter: Delimiter,
  headerRow: number = 0
): { headers: string[]; rows: string[][]; preHeaderLines: string[] } {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');

  if (lines.length === 0) return { headers: [], rows: [], preHeaderLines: [] };

  const preHeaderLines = lines.slice(0, headerRow);

  if (headerRow >= lines.length) {
    return { headers: [], rows: [], preHeaderLines: lines };
  }

  let headers = lines[headerRow].split(delimiter);

  // Trim trailing empty headers
  while (headers.length > 0 && headers[headers.length - 1].trim() === '') {
    headers.pop();
  }
  headers = headers.map((h) => h.trim());

  const rows = lines.slice(headerRow + 1).map((line) => {
    const cols = line.split(delimiter);
    // Only take as many columns as we have headers
    return cols.slice(0, headers.length);
  });

  return { headers, rows, preHeaderLines };
}

export interface CsvParseResult {
  /** All valid records as key/value maps (using original header as key) */
  records: Record<string, string>[];
  /** Detected column indices */
  latIndex: number;
  lngIndex: number;
  nameIndex: number;
  timestampIndex: number;
  /** Headers after trimming */
  headers: string[];
  /** Total rows before filtering (excluding header) */
  totalRows: number;
  /** Rows skipped due to missing lat/lng */
  skippedRows: number;
}

export interface ColumnMapping {
  latColumn: number; // -1 = not assigned
  lngColumn: number;
  nameColumn: number;
  timestampColumn: number;
}

/**
 * Convert parsed CSV to records, detecting special columns and filtering invalid rows.
 *
 * When `mapping` is provided, its indices are used instead of auto-detecting
 * via `findColumn`. When `excludedColumns` is provided, those column indices
 * are skipped when building records.
 */
export function csvToRecords(
  headers: string[],
  rows: string[][],
  mapping?: ColumnMapping,
  excludedColumns?: Set<number>
): CsvParseResult {
  const latIndex = mapping ? mapping.latColumn : findColumn(headers, KNOWN_LAT_NAMES);
  const lngIndex = mapping ? mapping.lngColumn : findColumn(headers, KNOWN_LNG_NAMES);
  const nameIndex = mapping ? mapping.nameColumn : findColumn(headers, KNOWN_NAME_NAMES);
  const timestampIndex = mapping
    ? mapping.timestampColumn
    : findColumn(headers, KNOWN_TIMESTAMP_NAMES);

  let skippedRows = 0;
  const records: Record<string, string>[] = [];

  for (const row of rows) {
    // Skip rows with missing or empty lat/lng
    if (latIndex < 0 || lngIndex < 0) {
      skippedRows = rows.length;
      break;
    }
    const latStr = row[latIndex]?.trim();
    const lngStr = row[lngIndex]?.trim();
    if (!latStr || !lngStr || isNaN(Number(latStr)) || isNaN(Number(lngStr))) {
      skippedRows++;
      continue;
    }

    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      if (excludedColumns?.has(i)) continue;
      const value = row[i]?.trim() ?? '';
      if (value !== '') {
        record[headers[i]] = value;
      }
    }
    records.push(record);
  }

  return {
    records,
    latIndex,
    lngIndex,
    nameIndex,
    timestampIndex,
    headers,
    totalRows: rows.length,
    skippedRows,
  };
}

/**
 * Apply downsampling: keep every Nth record.
 */
export function downsample<T>(records: T[], everyNth: number): T[] {
  if (everyNth <= 1) return records;
  return records.filter((_, i) => i % everyNth === 0);
}

/**
 * Convert CSV records to FirecallItems with dataSchema.
 *
 * @param headerToSchemaKey - Stable mapping from original CSV header to the
 *   initial schema key (as generated). Used to look up the *current* schema
 *   field even after the user renames keys in the editor.
 * @param schema - The (possibly user-edited) schema. Field keys may differ
 *   from the initial generated keys.
 */
export function csvRecordsToItems(
  result: CsvParseResult,
  records: Record<string, string>[],
  schema: DataSchemaField[],
  headerToSchemaKey: Map<string, string>
): FirecallItem[] {
  const { latIndex, lngIndex, nameIndex, timestampIndex, headers } = result;

  // Build lookup: initial schema key → current schema field (handles renames)
  // headerToSchemaKey maps header → initial key.  We need to find which
  // schema field *currently* has that initial key, or if the user changed it,
  // match by index (schema order matches headerToSchemaKey insertion order).
  const initialKeyToField = new Map<string, DataSchemaField>();
  const initialKeys = Array.from(headerToSchemaKey.values());
  for (let i = 0; i < initialKeys.length && i < schema.length; i++) {
    initialKeyToField.set(initialKeys[i], schema[i]);
  }

  // Build set of special column headers to exclude from fieldData
  const specialHeaders = new Set<string>();
  if (latIndex >= 0) specialHeaders.add(headers[latIndex]);
  if (lngIndex >= 0) specialHeaders.add(headers[lngIndex]);
  if (nameIndex >= 0) specialHeaders.add(headers[nameIndex]);
  if (timestampIndex >= 0) specialHeaders.add(headers[timestampIndex]);

  return records.map((record, index) => {
    const lat = parseFloat(record[headers[latIndex]]);
    const lng = parseFloat(record[headers[lngIndex]]);

    const name =
      nameIndex >= 0 && record[headers[nameIndex]]
        ? record[headers[nameIndex]]
        : `${index + 1}`;

    const datum =
      timestampIndex >= 0 && record[headers[timestampIndex]]
        ? new Date(record[headers[timestampIndex]]).toISOString()
        : new Date().toISOString();

    // Build fieldData using the stable header → schema mapping
    const fieldData: Record<string, string | number | boolean> = {};
    for (const [header, value] of Object.entries(record)) {
      if (specialHeaders.has(header)) continue;
      const initialKey = headerToSchemaKey.get(header);
      if (!initialKey) continue;
      const field = initialKeyToField.get(initialKey);
      if (field) {
        fieldData[field.key] = coerceValue(value, field.type);
      }
    }

    return {
      type: 'marker',
      name,
      datum,
      lat,
      lng,
      fieldData,
    } as FirecallItem;
  });
}

/**
 * Extract metadata from pre-header lines (lines before the CSV header).
 * Returns a suggested layer name derived from the first pre-header line.
 */
export function parsePreHeaderMetadata(
  preHeaderLines: string[],
  delimiter: string
): { suggestedName: string } {
  if (preHeaderLines.length === 0) return { suggestedName: '' };

  const fields = preHeaderLines[0]
    .split(delimiter)
    .map((f) => f.trim())
    .filter((f) => f !== '');

  // Try to find a name-like field: non-numeric, length > 1, not a date/ID/Track pattern
  const nameLike = fields.find(
    (f) =>
      f.length > 1 &&
      isNaN(Number(f)) &&
      !/^\d{4}-\d{2}-\d{2}/.test(f) &&
      !/^[A-Z]{2,3}-\d+/.test(f) && // Skip device IDs like RC-110-004760
      !/^Track:/i.test(f) // Skip "Track: ..." metadata fields
  );

  return { suggestedName: nameLike || fields[0] || '' };
}
