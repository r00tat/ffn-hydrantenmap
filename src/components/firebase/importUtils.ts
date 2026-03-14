import { DataSchemaField } from './firestore';

/**
 * Shared utilities for importing data (KML, CSV, etc.) into firecall layers.
 */

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[äöüß]/g, (c) =>
      c === 'ä' ? 'ae' : c === 'ö' ? 'oe' : c === 'ü' ? 'ue' : 'ss'
    )
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function inferType(value: any): DataSchemaField['type'] {
  if (typeof value === 'boolean' || value === 'true' || value === 'false')
    return 'boolean';
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && value !== '' && !isNaN(Number(value)))
  )
    return 'number';
  return 'text';
}

export function coerceValue(
  value: any,
  type: DataSchemaField['type']
): string | number | boolean {
  if (type === 'boolean') return value === true || value === 'true';
  if (type === 'number')
    return typeof value === 'number' ? value : parseFloat(value) || 0;
  return String(value);
}

/**
 * Parse a header string like "Temperature ℃" or "PM2.5 μg/m³" into label and unit.
 * Recognizes:
 *   - Units in parentheses: "Pressure (Pa)" → { label: "Pressure", unit: "Pa" }
 *   - Trailing unit symbols/words: "Temperature ℃" → { label: "Temperature", unit: "℃" }
 *   - Common unit patterns: %, ℃, °C, m/s, μg/m³, ppm, Pa, mg/m³, etc.
 */
export function parseHeaderUnit(header: string): {
  label: string;
  unit: string;
} {
  const trimmed = header.trim();

  // Check for unit in parentheses: "Pressure (Pa)"
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return { label: parenMatch[1].trim(), unit: parenMatch[2].trim() };
  }

  // Check for trailing unit pattern after last space
  // Matches: ℃, °C, °F, %, ppm, Pa, μg/m³, mg/m³, m/s, m, km, l/min, bar, etc.
  const unitMatch = trimmed.match(
    /^(.+?)\s+(℃|°[CF]|%|ppm|ppb|Pa|hPa|mbar|bar|μg\/m³|mg\/m³|m\/s|km\/h|[mcdk]?m|l\/min|mol\/l|dB|Hz|kHz|W|kW|MW|V|mV|A|mA|Ω|kΩ|lux|cd)\s*$/i
  );
  if (unitMatch) {
    return { label: unitMatch[1].trim(), unit: unitMatch[2].trim() };
  }

  return { label: trimmed, unit: '' };
}

/** Known column name variants for latitude */
export const KNOWN_LAT_NAMES = [
  'latitude',
  'lat',
  'breite',
  'breitengrad',
];

/** Known column name variants for longitude */
export const KNOWN_LNG_NAMES = [
  'longitude',
  'lng',
  'lon',
  'long',
  'laenge',
  'länge',
  'laengengrad',
  'längengrad',
];

/** Known column name variants for name/title */
export const KNOWN_NAME_NAMES = [
  'name',
  'bezeichnung',
  'titel',
  'title',
  'label',
];

/** Known column name variants for timestamp */
export const KNOWN_TIMESTAMP_NAMES = [
  'time stamp',
  'timestamp',
  'time',
  'datum',
  'date',
  'zeit',
  'datetime',
  'date_time',
];

/**
 * Find column index by matching header against known name candidates (case-insensitive).
 * Matches against the raw header and the parsed label (without unit).
 */
export function findColumn(
  headers: string[],
  candidates: string[]
): number {
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  return headers.findIndex((h) => {
    const raw = h.trim().toLowerCase();
    const { label } = parseHeaderUnit(h);
    const parsedLower = label.toLowerCase();
    return (
      lowerCandidates.includes(raw) || lowerCandidates.includes(parsedLower)
    );
  });
}

export interface SchemaGenerationResult {
  schema: DataSchemaField[];
  /** Maps original CSV header → generated schema field key. Stable across schema edits. */
  headerToSchemaKey: Map<string, string>;
}

/**
 * Generate DataSchemaField[] from flat records, excluding specified keys.
 * Uses parseHeaderUnit to extract units from original headers.
 * Returns both the schema and a stable mapping from original headers to schema keys.
 */
export function generateSchemaFromRecords(
  records: Record<string, any>[],
  excludeKeys: Set<string>,
  originalHeaders?: string[]
): SchemaGenerationResult {
  const fieldMap = new Map<string, Set<DataSchemaField['type']>>();

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (excludeKeys.has(key)) continue;
      if (value === undefined || value === null || value === '') continue;
      if (!fieldMap.has(key)) fieldMap.set(key, new Set());
      fieldMap.get(key)!.add(inferType(value));
    }
  }

  // Build a lookup from raw key to original header for unit extraction
  const headerLookup = new Map<string, string>();
  if (originalHeaders) {
    for (const h of originalHeaders) {
      headerLookup.set(h.trim(), h.trim());
    }
  }

  const headerToSchemaKey = new Map<string, string>();
  const schema = Array.from(fieldMap.entries()).map(([key, types]) => {
    const originalHeader = headerLookup.get(key) || key;
    const { label, unit } = parseHeaderUnit(originalHeader);
    const schemaKey = slugify(key);
    headerToSchemaKey.set(key, schemaKey);
    return {
      key: schemaKey,
      label,
      unit,
      type: types.size === 1 ? types.values().next().value! : 'text',
    };
  });

  return { schema, headerToSchemaKey };
}
