import { parse } from 'csv-parse/sync';

export interface ParsedHydrantRow {
  ortschaft: string;
  typ: string;
  hydranten_nummer: string;
  fuellhydrant: string;
  dimension: number;
  leitungsart: string;
  statischer_druck: number;
  dynamischer_druck: number;
  druckmessung_datum: string;
  meereshoehe: number;
  raw_x: number;
  raw_y: number;
  documentKey: string;
}

/** All available target fields that CSV columns can be mapped to */
export const TARGET_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'ortschaft', label: 'Ortschaft', required: true },
  { key: 'typ', label: 'Typ' },
  { key: 'hydranten_nummer', label: 'Hydranten-Nr.', required: true },
  { key: 'fuellhydrant', label: 'Füllhydrant' },
  { key: 'dimension', label: 'Dimension' },
  { key: 'leitungsart', label: 'Leitungsart' },
  { key: 'statischer_druck', label: 'Statischer Druck' },
  { key: 'dynamischer_druck', label: 'Dynamischer Druck' },
  { key: 'druckmessung_datum', label: 'Druckmessung Datum' },
  { key: 'meereshoehe', label: 'Meereshöhe' },
  { key: 'raw_x', label: 'X-Koordinate (GK M34)', required: true },
  { key: 'raw_y', label: 'Y-Koordinate (GK M34)', required: true },
];

/** Default mapping: normalized CSV header → target field key */
export const DEFAULT_COLUMN_MAP: Record<string, string> = {
  ortsnetz_versorgungseinheit: 'ortschaft',
  art: 'typ',
  hydranten_nr_: 'hydranten_nummer',
  gemeinde_wz: 'fuellhydrant',
  dimension: 'dimension',
  leitungsart: 'leitungsart',
  stat_druck_: 'statischer_druck',
  dyn_druck: 'dynamischer_druck',
  druck_gemessen_am: 'druckmessung_datum',
  gok_: 'meereshoehe',
  x_koordinate: 'raw_x',
  y_koordinate: 'raw_y',
};

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Auto-detect mapping from CSV headers using the default column map */
export function autoDetectMapping(csvHeaders: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of csvHeaders) {
    const normalized = normalizeHeader(header);
    // Try exact match, then with trailing underscore (headers may have trailing spaces
    // that get trimmed by the UI but produce a trailing _ in normalizeHeader)
    const match = DEFAULT_COLUMN_MAP[normalized]
      ?? DEFAULT_COLUMN_MAP[normalized + '_']
      ?? DEFAULT_COLUMN_MAP[normalized.replace(/_$/, '')];
    if (match) {
      mapping[header] = match;
    }
  }
  return mapping;
}

function parseDecimalComma(value: string): number {
  if (typeof value !== 'string') return Number(value);
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  return Number.parseFloat(cleaned);
}

function mapFuellhydrant(value: string): string {
  if (!value || value === '---') return 'NEIN';
  if (value.toLowerCase() === 'ja') return 'JA';
  return value.toUpperCase();
}

function generateDocumentKey(
  ortschaft: string,
  hydrantenNummer: string
): string {
  return `${ortschaft}_${hydrantenNummer}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_');
}

/**
 * Parse WLV CSV text into hydrant records.
 * @param csvText Raw CSV text
 * @param customMapping Optional mapping from original CSV header → target field.
 *   If not provided, uses auto-detection via DEFAULT_COLUMN_MAP on normalized headers.
 */
export function parseHydrantenCsv(
  csvText: string,
  customMapping?: Record<string, string>
): ParsedHydrantRow[] {
  const lines = csvText.split('\n');
  if (lines.length >= 2) {
    // Remove the description row (second line)
    lines.splice(1, 1);
  }
  const cleaned = lines.join('\n');

  // Build the effective mapping: normalized header → target field
  let effectiveMap: Record<string, string>;
  if (customMapping) {
    // customMapping is original header → target, convert to normalized header → target
    effectiveMap = {};
    for (const [originalHeader, target] of Object.entries(customMapping)) {
      if (target) {
        effectiveMap[normalizeHeader(originalHeader)] = target;
      }
    }
  } else {
    effectiveMap = DEFAULT_COLUMN_MAP;
  }

  const records: Record<string, string>[] = parse(cleaned, {
    columns: (header: string[]) => header.map(normalizeHeader),
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return records.map((record) => {
    const mapped: Record<string, unknown> = {};
    for (const [csvKey, targetKey] of Object.entries(effectiveMap)) {
      if (record[csvKey] !== undefined) {
        mapped[targetKey] = record[csvKey];
      }
    }

    const numericFields = [
      'statischer_druck',
      'dynamischer_druck',
      'meereshoehe',
      'raw_x',
      'raw_y',
      'dimension',
    ];
    for (const field of numericFields) {
      if (mapped[field] !== undefined) {
        mapped[field] = parseDecimalComma(String(mapped[field]));
      }
    }

    mapped.fuellhydrant = mapFuellhydrant(String(mapped.fuellhydrant ?? ''));
    mapped.documentKey = generateDocumentKey(
      String(mapped.ortschaft ?? ''),
      String(mapped.hydranten_nummer ?? '')
    );

    return mapped as unknown as ParsedHydrantRow;
  });
}
