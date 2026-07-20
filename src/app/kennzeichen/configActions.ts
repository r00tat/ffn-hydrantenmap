'use server';
import 'server-only';

import { actionAdminRequired, actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { encryptPassword } from '../../server/blaulichtsms/encryption';
import { filterGroupsByMembership } from '../blaulicht-sms/groupFilter';
import { OEBFV_CONFIG_COLLECTION } from './tokenStore';

export interface OebfvConfigPublic {
  groupId: string;
  hasToken: boolean;
  updatedAt: string;
  updatedBy: string;
}

// Admin-only: public config for the group (never returns the token itself).
export async function getOebfvConfig(
  groupId: string,
): Promise<OebfvConfigPublic | null> {
  await actionAdminRequired();
  const doc = await firestore
    .collection(OEBFV_CONFIG_COLLECTION)
    .doc(groupId)
    .get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    groupId,
    hasToken: !!data.tokenEncrypted,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
  };
}

// Admin-only: save the token (omit/empty => keep existing).
export async function saveOebfvConfig(
  groupId: string,
  data: { token?: string },
): Promise<void> {
  const session = await actionAdminRequired();

  const existing = await firestore
    .collection(OEBFV_CONFIG_COLLECTION)
    .doc(groupId)
    .get();
  const existingEncrypted = existing.exists
    ? existing.data()!.tokenEncrypted
    : undefined;

  const tokenEncrypted =
    data.token && data.token.length > 0
      ? await encryptPassword(data.token)
      : existingEncrypted;

  if (!tokenEncrypted) {
    throw new Error('A token is required when creating a new configuration.');
  }

  await firestore
    .collection(OEBFV_CONFIG_COLLECTION)
    .doc(groupId)
    .set({
      groupId,
      tokenEncrypted,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.email,
    });
}

// Admin-only: delete the configuration for a group.
export async function deleteOebfvConfig(groupId: string): Promise<void> {
  await actionAdminRequired();
  await firestore.collection(OEBFV_CONFIG_COLLECTION).doc(groupId).delete();
}

// User-accessible: whether a token is configured for the group.
export async function hasOebfvConfig(groupId: string): Promise<boolean> {
  await actionUserRequired();
  const doc = await firestore
    .collection(OEBFV_CONFIG_COLLECTION)
    .doc(groupId)
    .get();
  return doc.exists && !!doc.data()!.tokenEncrypted;
}

// User-accessible: configured group IDs the caller is a member of
// (admins receive all). Used by the page to pick a group.
export async function getGroupsWithOebfvConfig(): Promise<string[]> {
  const session = await actionUserRequired();
  const snapshot = await firestore.collection(OEBFV_CONFIG_COLLECTION).get();
  const all = snapshot.docs
    .filter((d) => !!d.data().tokenEncrypted)
    .map((d) => d.id);
  return filterGroupsByMembership(
    all,
    session.user.groups ?? [],
    session.user.isAdmin,
  );
}
