import type { ConvertedHydrantRow } from './hydrantenCsvConverter';

export type MatchStatus = 'new' | 'update';

export interface MatchResult {
  row: ConvertedHydrantRow;
  status: MatchStatus;
  duplicateDocId?: string;
  preservedFields: Record<string, unknown>;
}

const PRESERVE_FIELDS = ['leistung'];

export interface ExistingHydrant {
  id: string;
  ortschaft: string;
  hydranten_nummer: string;
  [key: string]: unknown;
}

export function matchHydranten(
  rows: ConvertedHydrantRow[],
  existing: ExistingHydrant[],
): MatchResult[] {
  // Build index: hydranten_nummer (lowercase) -> list of {docId, ortschaft, data}
  const byNummer = new Map<
    string,
    { id: string; ortschaft: string; data: ExistingHydrant }[]
  >();
  for (const doc of existing) {
    const key = (doc.hydranten_nummer ?? '').toLowerCase();
    if (!byNummer.has(key)) byNummer.set(key, []);
    byNummer.get(key)!.push({
      id: doc.id,
      ortschaft: doc.ortschaft ?? '',
      data: doc,
    });
  }

  // Build index by doc ID for direct key match
  const byDocId = new Map<string, ExistingHydrant>();
  for (const doc of existing) {
    byDocId.set(doc.id, doc);
  }

  return rows.map((row) => {
    const nummerKey = row.hydranten_nummer.toLowerCase();
    const preservedFields: Record<string, unknown> = {};

    // 1. Direct key match
    const directMatch = byDocId.get(row.documentKey);
    if (directMatch) {
      for (const field of PRESERVE_FIELDS) {
        if (
          directMatch[field] !== undefined &&
          directMatch[field] !== null
        ) {
          preservedFields[field] = directMatch[field];
        }
      }
      return { row, status: 'update' as const, preservedFields };
    }

    // 2. Alias match (same hydranten_nummer, different key)
    const candidates = byNummer.get(nummerKey) || [];
    const aliasMatch = candidates.find((c) => c.id !== row.documentKey);
    if (aliasMatch) {
      for (const field of PRESERVE_FIELDS) {
        if (
          aliasMatch.data[field] !== undefined &&
          aliasMatch.data[field] !== null
        ) {
          preservedFields[field] = aliasMatch.data[field];
        }
      }
      return {
        row,
        status: 'update' as const,
        duplicateDocId: aliasMatch.id,
        preservedFields,
      };
    }

    // 3. No match
    return { row, status: 'new' as const, preservedFields };
  });
}
