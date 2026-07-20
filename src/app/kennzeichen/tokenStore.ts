import 'server-only';

import { firestore } from '../../server/firebase/admin';
import { decryptPassword } from '../../server/blaulichtsms/encryption';

export const OEBFV_CONFIG_COLLECTION = 'oebfvKennzeichenConfig';

/**
 * Decrypt and return the token for a group, or null. Server-internal only —
 * NOT a `'use server'` action, so it is never exposed as a client-callable
 * endpoint. Callers (queryActions) guard the request before invoking this.
 */
export async function loadOebfvToken(groupId: string): Promise<string | null> {
  const doc = await firestore
    .collection(OEBFV_CONFIG_COLLECTION)
    .doc(groupId)
    .get();
  if (!doc.exists) return null;
  const encrypted = doc.data()!.tokenEncrypted;
  if (!encrypted) return null;
  try {
    return await decryptPassword(encrypted);
  } catch (err) {
    console.error(`Failed to decrypt ÖBFV token for group "${groupId}":`, err);
    return null;
  }
}
