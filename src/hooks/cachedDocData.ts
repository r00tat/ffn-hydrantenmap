import { DocumentReference, getDocFromCache } from 'firebase/firestore';

/**
 * Der Stand eines Dokuments aus dem lokalen Cache, `undefined`, wenn es dort
 * fehlt. Gedacht für den Vorzustand im Audit-Log: Der Cache antwortet auch
 * offline und ohne Wartezeit auf den Server.
 */
export async function cachedDocData(
  ref: DocumentReference
): Promise<Record<string, unknown> | undefined> {
  try {
    const snap = await getDocFromCache(ref);
    return snap.exists() ? snap.data() : undefined;
  } catch {
    return undefined;
  }
}
