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

  // Process in batches of 400 (Firestore limit is 500 per batch)
  const batchSize = 400;
  for (let i = 0; i < matchResults.length; i += batchSize) {
    const batch = firestore.batch();
    const chunk = matchResults.slice(i, i + batchSize);

    for (const result of chunk) {
      const { row, status, duplicateDocId, preservedFields } = result;

      // Build document data (exclude raw_x, raw_y, documentKey)
      const { raw_x, raw_y, documentKey, ...data } = row;
      const docData = { ...data, ...preservedFields };

      batch.set(collection.doc(row.documentKey), docData, { merge: true });

      if (status === 'new') stats.created++;
      else stats.updated++;

      // Delete duplicate doc if found
      if (duplicateDocId && duplicateDocId !== row.documentKey) {
        batch.delete(collection.doc(duplicateDocId));
        stats.duplicatesDeleted++;
      }
    }

    await batch.commit();
  }

  return stats;
}
