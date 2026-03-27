/**
 * Layer item export utilities: CSV, GPX, KML
 */

import { LatLngPosition } from '../../common/geo';
import { FirecallItem } from './firestore';
import { getItemInstance } from '../FirecallItems/elements';

// Fields to skip in export (internal/UI-only)
const SKIP_FIELDS = new Set([
  'id',
  'type',
  'original',
  'deleted',
  'editable',
  'draggable',
  'eventHandlers',
  'layer',
  'zIndex',
  'rotation',
  'creator',
  'created',
  'updatedAt',
  'updatedBy',
  'fieldData',
  'attachments',
  'positions',
  'destLat',
  'destLng',
]);

const BASE_COLUMNS = [
  'name',
  'type',
  'lat',
  'lng',
  'alt',
  'beschreibung',
  'datum',
];

const MULTIPOINT_TYPES = new Set(['line', 'connection', 'area']);

// --- Internal helpers ---

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsvValue(value: string, separator = ';'): string {
  if (
    value.includes(separator) ||
    value.includes('"') ||
    value.includes('\n')
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function isMultiPoint(type: string): boolean {
  return MULTIPOINT_TYPES.has(type);
}

function parsePositions(
  item: FirecallItem,
): LatLngPosition[] {
  const raw = (item as unknown as Record<string, unknown>).positions as
    | string
    | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LatLngPosition[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // fall through
    }
  }
  // Fallback to start + end points
  const mp = item as unknown as Record<string, unknown>;
  const points: LatLngPosition[] = [];
  if (item.lat != null && item.lng != null) {
    points.push([item.lat, item.lng]);
  }
  if (mp.destLat != null && mp.destLng != null) {
    points.push([mp.destLat as number, mp.destLng as number]);
  }
  return points;
}

/**
 * Collect type-specific + fieldData fields as a flat string map.
 * Excludes base columns and SKIP_FIELDS.
 */
function buildExtensionFields(
  item: FirecallItem,
  data: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};

  // Type-specific fields from data()
  for (const [key, value] of Object.entries(data)) {
    if (SKIP_FIELDS.has(key) || BASE_COLUMNS.includes(key)) continue;
    if (value != null && value !== '') {
      result[key] = String(value);
    }
  }

  // fieldData with prefix
  if (item.fieldData) {
    for (const [key, value] of Object.entries(item.fieldData)) {
      if (value != null && value !== '') {
        result[`fieldData.${key}`] = String(value);
      }
    }
  }

  return result;
}

interface ExportRow {
  type: string;
  values: Record<string, string>;
}

/**
 * Collect all columns and row data for CSV export.
 */
function collectExportRows(items: FirecallItem[]): {
  columns: string[];
  rows: ExportRow[];
} {
  const extraColumnsSet = new Set<string>();
  const rows: ExportRow[] = [];

  for (const item of items) {
    const instance = getItemInstance(item);
    const data = instance.data() as unknown as Record<string, unknown>;
    const values: Record<string, string> = {};

    // Base columns (use 'type' from original item, not data)
    values['type'] = item.type;
    for (const col of BASE_COLUMNS) {
      if (col === 'type') continue;
      const v = data[col];
      if (v != null) {
        values[col] = String(v);
      }
    }

    // Type-specific fields
    for (const [key, value] of Object.entries(data)) {
      if (SKIP_FIELDS.has(key) || BASE_COLUMNS.includes(key)) continue;
      if (value != null && value !== '') {
        values[key] = String(value);
        extraColumnsSet.add(key);
      }
    }

    // fieldData with prefix
    if (item.fieldData) {
      for (const [key, value] of Object.entries(item.fieldData)) {
        const colName = `fieldData.${key}`;
        if (value != null && value !== '') {
          values[colName] = String(value);
          extraColumnsSet.add(colName);
        }
      }
    }

    // Multipoint fields (re-add explicitly)
    if (isMultiPoint(item.type)) {
      const mp = data as unknown as Record<string, unknown>;
      if (mp.positions != null) {
        values['positions'] = String(mp.positions);
        extraColumnsSet.add('positions');
      }
      if (mp.destLat != null) {
        values['destLat'] = String(mp.destLat);
        extraColumnsSet.add('destLat');
      }
      if (mp.destLng != null) {
        values['destLng'] = String(mp.destLng);
        extraColumnsSet.add('destLng');
      }
    }

    rows.push({ type: item.type, values });
  }

  const extraColumns = [...extraColumnsSet].sort();
  const columns = [...BASE_COLUMNS, ...extraColumns];

  return { columns, rows };
}

// --- Public export functions ---

/**
 * Export layer items to semicolon-separated CSV with UTF-8 BOM.
 */
export function exportLayerItemsToCsv(items: FirecallItem[]): string {
  if (items.length === 0) return '';

  const { columns, rows } = collectExportRows(items);

  const headerLine = columns.map((c) => escapeCsvValue(c)).join(';');
  const dataLines = rows.map((row) =>
    columns
      .map((col) => escapeCsvValue(row.values[col] ?? ''))
      .join(';'),
  );

  return '\uFEFF' + [headerLine, ...dataLines].join('\n');
}

/**
 * Export layer items to GPX 1.1 format.
 */
export function exportLayerItemsToGpx(items: FirecallItem[], layerName: string): string {
  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" creator="Einsatzkarte">',
  );
  parts.push(`  <metadata><name>${escapeXml(layerName)}</name></metadata>`);

  for (const item of items) {
    const instance = getItemInstance(item);
    const data = instance.data() as unknown as Record<string, unknown>;
    const extensions = buildExtensionFields(item, data);

    if (isMultiPoint(item.type)) {
      // Track
      parts.push('  <trk>');
      parts.push(`    <name>${escapeXml(item.name)}</name>`);
      if (item.beschreibung) {
        parts.push(`    <desc>${escapeXml(item.beschreibung)}</desc>`);
      }
      if (item.datum) {
        parts.push(`    <time>${escapeXml(item.datum)}</time>`);
      }

      // Extensions
      if (Object.keys(extensions).length > 0) {
        parts.push('    <extensions>');
        for (const [key, value] of Object.entries(extensions).sort(([a], [b]) => a.localeCompare(b))) {
          parts.push(`      <${key}>${escapeXml(value)}</${key}>`);
        }
        parts.push('    </extensions>');
      }

      parts.push('    <trkseg>');
      const positions = parsePositions(item);
      for (const [lat, lng] of positions) {
        parts.push(`      <trkpt lat="${lat}" lon="${lng}">`);
        parts.push('      </trkpt>');
      }
      parts.push('    </trkseg>');
      parts.push('  </trk>');
    } else {
      // Waypoint
      const lat = item.lat ?? 0;
      const lng = item.lng ?? 0;
      parts.push(`  <wpt lat="${lat}" lon="${lng}">`);
      parts.push(`    <name>${escapeXml(item.name)}</name>`);
      if (item.alt != null) {
        parts.push(`    <ele>${item.alt}</ele>`);
      }
      if (item.beschreibung) {
        parts.push(`    <desc>${escapeXml(item.beschreibung)}</desc>`);
      }
      if (item.datum) {
        parts.push(`    <time>${escapeXml(item.datum)}</time>`);
      }

      // Extensions
      if (Object.keys(extensions).length > 0) {
        parts.push('    <extensions>');
        for (const [key, value] of Object.entries(extensions).sort(([a], [b]) => a.localeCompare(b))) {
          parts.push(`      <${key}>${escapeXml(value)}</${key}>`);
        }
        parts.push('    </extensions>');
      }

      parts.push('  </wpt>');
    }
  }

  parts.push('</gpx>');
  return parts.join('\n');
}

/**
 * Export layer items to KML 2.2 format.
 */
export function exportLayerItemsToKml(items: FirecallItem[], layerName: string): string {
  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  parts.push('  <Document>');
  parts.push(`    <name>${escapeXml(layerName)}</name>`);

  for (const item of items) {
    const instance = getItemInstance(item);
    const data = instance.data() as unknown as Record<string, unknown>;
    const extensions = buildExtensionFields(item, data);

    parts.push('    <Placemark>');
    parts.push(`      <name>${escapeXml(item.name)}</name>`);
    if (item.beschreibung) {
      parts.push(
        `      <description>${escapeXml(item.beschreibung)}</description>`,
      );
    }

    // ExtendedData
    if (Object.keys(extensions).length > 0) {
      parts.push('      <ExtendedData>');
      for (const [key, value] of Object.entries(extensions).sort(([a], [b]) => a.localeCompare(b))) {
        parts.push(`        <Data name="${escapeXml(key)}">`);
        parts.push(`          <value>${escapeXml(value)}</value>`);
        parts.push('        </Data>');
      }
      parts.push('      </ExtendedData>');
    }

    if (item.type === 'area') {
      // Polygon
      const positions = parsePositions(item);
      // Ensure closed ring
      if (
        positions.length > 0 &&
        (positions[0][0] !== positions[positions.length - 1][0] ||
          positions[0][1] !== positions[positions.length - 1][1])
      ) {
        positions.push(positions[0]);
      }
      const coordStr = positions
        .map(([lat, lng]) => `${lng},${lat},0`)
        .join(' ');
      parts.push('      <Polygon>');
      parts.push('        <outerBoundaryIs>');
      parts.push('          <LinearRing>');
      parts.push(`            <coordinates>${coordStr}</coordinates>`);
      parts.push('          </LinearRing>');
      parts.push('        </outerBoundaryIs>');
      parts.push('      </Polygon>');
    } else if (isMultiPoint(item.type)) {
      // LineString (line, connection)
      const positions = parsePositions(item);
      const coordStr = positions
        .map(([lat, lng]) => `${lng},${lat},0`)
        .join(' ');
      parts.push('      <LineString>');
      parts.push(`        <coordinates>${coordStr}</coordinates>`);
      parts.push('      </LineString>');
    } else {
      // Point
      const lat = item.lat ?? 0;
      const lng = item.lng ?? 0;
      const alt = item.alt ?? 0;
      parts.push('      <Point>');
      parts.push(`        <coordinates>${lng},${lat},${alt}</coordinates>`);
      parts.push('      </Point>');
    }

    parts.push('    </Placemark>');
  }

  parts.push('  </Document>');
  parts.push('</kml>');
  return parts.join('\n');
}
