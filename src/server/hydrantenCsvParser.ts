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

const COLUMN_MAP: Record<string, string> = {
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

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '_');
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

export function parseHydrantenCsv(csvText: string): ParsedHydrantRow[] {
  const lines = csvText.split('\n');
  if (lines.length >= 2) {
    // Remove the description row (second line)
    lines.splice(1, 1);
  }
  const cleaned = lines.join('\n');

  const records: Record<string, string>[] = parse(cleaned, {
    columns: (header: string[]) => header.map(normalizeHeader),
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return records.map((record) => {
    const mapped: Record<string, unknown> = {};
    for (const [csvKey, targetKey] of Object.entries(COLUMN_MAP)) {
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
