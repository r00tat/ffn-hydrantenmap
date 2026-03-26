'use server';

import { parseHydrantenCsv } from '../../server/hydrantenCsvParser';
import {
  convertCoordinates,
  type ConvertedHydrantRow,
} from '../../server/hydrantenCsvConverter';
import {
  matchHydranten,
  type MatchResult,
  type ExistingHydrant,
} from '../../server/hydrantenMatcher';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired } from '../auth';

export interface CsvParseResult {
  records: ConvertedHydrantRow[];
  totalParsed: number;
  skippedInvalidCoords: number;
}

export async function parseAndConvertCsv(
  formData: FormData
): Promise<CsvParseResult> {
  await actionAdminRequired();

  const file = formData.get('csvFile') as File;
  if (!file) throw new Error('No CSV file provided');

  const csvText = await file.text();
  const parsed = parseHydrantenCsv(csvText);
  const converted = convertCoordinates(parsed);

  return {
    records: converted,
    totalParsed: parsed.length,
    skippedInvalidCoords: parsed.length - converted.length,
  };
}

export async function matchRecords(
  records: ConvertedHydrantRow[]
): Promise<MatchResult[]> {
  await actionAdminRequired();

  // Load all existing hydrants from Firestore
  const snapshot = await firestore.collection('hydrant').get();
  const existing: ExistingHydrant[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ExistingHydrant[];

  return matchHydranten(records, existing);
}

export interface ImportResult {
  created: number;
  updated: number;
  duplicatesDeleted: number;
}

export async function importRecords(
  matchResults: MatchResult[]
): Promise<ImportResult> {
  await actionAdminRequired();

  const stats = { created: 0, updated: 0, duplicatesDeleted: 0 };
  const collection = firestore.collection('hydrant');

  // Process in batches, respecting Firestore's 500 operations per batch limit.
  // Each record is 1 set + optionally 1 delete, so we track operation count.
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

    // Delete duplicate doc if found
    if (duplicateDocId && duplicateDocId !== row.documentKey) {
      batch.delete(collection.doc(duplicateDocId));
      opCount++;
      stats.duplicatesDeleted++;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  return stats;
}
