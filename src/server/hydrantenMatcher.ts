import type { ConvertedHydrantRow } from './hydrantenCsvConverter';

export type MatchStatus = 'new' | 'update';

export interface MatchResult {
  row: ConvertedHydrantRow;
  status: MatchStatus;
  duplicateDocId?: string;
  /** lat/lng of the existing matched record (for map comparison) */
  existingLat?: number;
  existingLng?: number;
  preservedFields: Record<string, unknown>;
}

const PRESERVE_FIELDS = ['leistung'];

/** Maximum distance in meters for alias matching */
const MAX_ALIAS_DISTANCE_M = 200;

export interface ExistingHydrant {
  id: string;
  ortschaft: string;
  hydranten_nummer: string;
  lat?: number;
  lng?: number;
  [key: string]: unknown;
}

/** Haversine distance in meters between two WGS84 points */
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractPreservedFields(doc: ExistingHydrant): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of PRESERVE_FIELDS) {
    if (doc[field] !== undefined && doc[field] !== null) {
      fields[field] = doc[field];
    }
  }
  return fields;
}

export function matchHydranten(
  rows: ConvertedHydrantRow[],
  existing: ExistingHydrant[],
): MatchResult[] {
  // Build index: hydranten_nummer (lowercase) -> list of existing docs
  const byNummer = new Map<string, ExistingHydrant[]>();
  for (const doc of existing) {
    const key = (doc.hydranten_nummer ?? '').toLowerCase();
    if (!byNummer.has(key)) byNummer.set(key, []);
    byNummer.get(key)!.push(doc);
  }

  // Build index by doc ID for direct key match
  const byDocId = new Map<string, ExistingHydrant>();
  for (const doc of existing) {
    byDocId.set(doc.id, doc);
  }

  return rows.map((row) => {
    const nummerKey = row.hydranten_nummer.toLowerCase();

    // 1. Direct key match (same document key)
    const directMatch = byDocId.get(row.documentKey);
    if (directMatch) {
      return {
        row,
        status: 'update' as const,
        existingLat: directMatch.lat,
        existingLng: directMatch.lng,
        preservedFields: extractPreservedFields(directMatch),
      };
    }

    // 2. Alias match: same hydranten_nummer + coordinates within 200m
    const candidates = byNummer.get(nummerKey) || [];
    const aliasMatch = candidates.find((c) => {
      if (c.id === row.documentKey) return false;
      // Require both records to have valid coordinates
      if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return false;
      return distanceMeters(row.lat, row.lng, c.lat, c.lng) <= MAX_ALIAS_DISTANCE_M;
    });

    if (aliasMatch) {
      return {
        row,
        status: 'update' as const,
        duplicateDocId: aliasMatch.id,
        existingLat: aliasMatch.lat,
        existingLng: aliasMatch.lng,
        preservedFields: extractPreservedFields(aliasMatch),
      };
    }

    // 3. No match
    return { row, status: 'new' as const, preservedFields: {} };
  });
}
