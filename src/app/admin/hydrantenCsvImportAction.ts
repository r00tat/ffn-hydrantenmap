'use server';

import { parseHydrantenCsv } from '../../server/hydrantenCsvParser';
import { convertCoordinates } from '../../server/hydrantenCsvConverter';
import {
  matchHydranten,
  type MatchResult,
  type ExistingHydrant,
} from '../../server/hydrantenMatcher';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired } from '../auth';
import { randomUUID } from 'crypto';

// Server-side cache for parsed results to avoid client→server round-trips.
// Keyed by session ID, auto-expires after 30 minutes.
const resultCache = new Map<string, { matchResults: MatchResult[]; expiresAt: number }>();

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of resultCache) {
    if (value.expiresAt < now) resultCache.delete(key);
  }
}

/** Serializable match result for the client (without full row data) */
export interface ClientMatchResult {
  status: 'new' | 'update';
  ortschaft: string;
  hydranten_nummer: string;
  typ: string;
  dimension: number;
  statischer_druck: number;
  dynamischer_druck: number;
  duplicateDocId?: string;
}

export interface ParseAndMatchResult {
  /** Opaque session ID to reference cached results for import */
  sessionId: string;
  totalParsed: number;
  totalConverted: number;
  skippedInvalidCoords: number;
  /** Lightweight match results for preview display */
  matches: ClientMatchResult[];
}

export async function parseAndMatchCsv(
  formData: FormData
): Promise<ParseAndMatchResult> {
  await actionAdminRequired();

  const file = formData.get('csvFile') as File;
  if (!file) throw new Error('No CSV file provided');

  // Step 1: Parse CSV
  const csvText = await file.text();
  const parsed = parseHydrantenCsv(csvText);

  // Step 2: Convert coordinates
  const converted = convertCoordinates(parsed);

  // Step 3: Match against existing Firestore data
  const snapshot = await firestore.collection('hydrant').get();
  const existing: ExistingHydrant[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ExistingHydrant[];

  const matchResults = matchHydranten(converted, existing);

  // Cache full results server-side (30 min TTL)
  cleanExpiredCache();
  const sessionId = randomUUID();
  resultCache.set(sessionId, {
    matchResults,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });

  // Return lightweight preview data to client
  const matches: ClientMatchResult[] = matchResults.map((r) => ({
    status: r.status,
    ortschaft: r.row.ortschaft,
    hydranten_nummer: r.row.hydranten_nummer,
    typ: r.row.typ,
    dimension: r.row.dimension,
    statischer_druck: r.row.statischer_druck,
    dynamischer_druck: r.row.dynamischer_druck,
    duplicateDocId: r.duplicateDocId,
  }));

  return {
    sessionId,
    totalParsed: parsed.length,
    totalConverted: converted.length,
    skippedInvalidCoords: parsed.length - converted.length,
    matches,
  };
}

export interface ImportResult {
  created: number;
  updated: number;
  duplicatesDeleted: number;
}

export async function importRecords(
  sessionId: string
): Promise<ImportResult> {
  await actionAdminRequired();

  const cached = resultCache.get(sessionId);
  if (!cached) throw new Error('Session expired or invalid. Please re-upload the CSV.');

  const { matchResults } = cached;
  const stats = { created: 0, updated: 0, duplicatesDeleted: 0 };
  const collection = firestore.collection('hydrant');

  // Process in batches, respecting Firestore's 500 operations per batch limit.
  const maxOps = 490;
  let batch = firestore.batch();
  let opCount = 0;

  for (const result of matchResults) {
    const { row, status, duplicateDocId, preservedFields } = result;

    // Build document data (exclude raw_x, raw_y, documentKey)
    const { raw_x, raw_y, documentKey, ...data } = row;
    const docData = { ...data, ...preservedFields };

    const opsNeeded = duplicateDocId && duplicateDocId !== row.documentKey ? 2 : 1;

    if (opCount + opsNeeded > maxOps) {
      await batch.commit();
      batch = firestore.batch();
      opCount = 0;
    }

    batch.set(collection.doc(row.documentKey), docData, { merge: true });
    opCount++;

    if (status === 'new') stats.created++;
    else stats.updated++;

    if (duplicateDocId && duplicateDocId !== row.documentKey) {
      batch.delete(collection.doc(duplicateDocId));
      opCount++;
      stats.duplicatesDeleted++;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  // Clean up cache
  resultCache.delete(sessionId);

  return stats;
}
