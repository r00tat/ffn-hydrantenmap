import 'server-only';
import { firestore } from '../../server/firebase/admin';
import { buildKennzeichenLogEntry, KennzeichenLogInput } from './logEntry';

export const KENNZEICHEN_LOG_COLLECTION = 'oebfvKennzeichenLog';

/** Persists a query log entry. Never throws — logging must not break a query. */
export async function writeKennzeichenLog(
  input: KennzeichenLogInput
): Promise<void> {
  try {
    const entry = buildKennzeichenLogEntry(input);
    await firestore.collection(KENNZEICHEN_LOG_COLLECTION).add(entry);
  } catch (err) {
    console.error('Failed to write Kennzeichen query log:', err);
  }
}
