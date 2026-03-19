'use server';
import 'server-only';

import { actionAdminRequired, actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { encryptPassword } from '../../server/blaulichtsms/encryption';

const COLLECTION = 'blaulichtsmsConfig';

export interface BlaulichtsmsConfigPublic {
  groupId: string;
  customerId: string;
  username: string;
  hasPassword: boolean;
  updatedAt: string;
  updatedBy: string;
}

// Admin-only: returns full public config (no plaintext or ciphertext)
export async function getBlaulichtsmsConfig(
  groupId: string
): Promise<BlaulichtsmsConfigPublic | null> {
  await actionAdminRequired();
  const doc = await firestore.collection(COLLECTION).doc(groupId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    groupId: data.groupId,
    customerId: data.customerId,
    username: data.username,
    hasPassword: !!data.passwordEncrypted,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
  };
}

// Admin-only: save credentials (password is optional; omit to keep existing)
export async function saveBlaulichtsmsConfig(
  groupId: string,
  data: { customerId: string; username: string; password?: string }
): Promise<void> {
  const session = await actionAdminRequired();

  const existing = await firestore.collection(COLLECTION).doc(groupId).get();
  const existingEncrypted = existing.exists
    ? existing.data()!.passwordEncrypted
    : undefined;

  const passwordEncrypted =
    data.password && data.password.length > 0
      ? await encryptPassword(data.password)
      : existingEncrypted;

  if (!passwordEncrypted) {
    throw new Error('A password is required when creating new credentials.');
  }

  await firestore
    .collection(COLLECTION)
    .doc(groupId)
    .set({
      groupId,
      customerId: data.customerId,
      username: data.username,
      passwordEncrypted,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    });
}

// Admin-only: delete credentials for a group
export async function deleteBlaulichtsmsConfig(
  groupId: string
): Promise<void> {
  await actionAdminRequired();
  await firestore.collection(COLLECTION).doc(groupId).delete();
}

// User-accessible: returns true if credentials are configured for the group.
// Used by BlaulichtSMS page to show "no credentials" info message.
export async function hasBlaulichtsmsConfig(
  groupId: string
): Promise<boolean> {
  await actionUserRequired();
  const doc = await firestore.collection(COLLECTION).doc(groupId).get();
  return doc.exists;
}

// User-accessible: returns group IDs that have credentials configured.
// Used by EinsatzDialog to decide whether to show the alarm dropdown.
export async function getGroupsWithBlaulichtsmsConfig(): Promise<string[]> {
  await actionUserRequired();
  const snapshot = await firestore.collection(COLLECTION).get();
  const groups = snapshot.docs.map((d) => d.id);

  // Include legacy group configured via env vars
  const legacyGroup = process.env.BLAULICHTSMS_REQUIRED_GROUP ?? 'ffnd';
  if (
    !groups.includes(legacyGroup) &&
    process.env.BLAULICHTSMS_USERNAME &&
    process.env.BLAULICHTSMS_PASSWORD &&
    process.env.BLAULICHTSMS_CUSTOMER_ID
  ) {
    groups.push(legacyGroup);
  }

  return groups;
}
