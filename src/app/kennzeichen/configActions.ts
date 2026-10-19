'use server';
import 'server-only';

import { actionAdminRequired, actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { encryptPassword } from '../../server/blaulichtsms/encryption';
import { can } from '../../common/permissions';
import {
  awaitsKostenersatzChoice,
  effectiveGroupRoles,
  type UserRolesSource,
} from '../../common/userGroupRoles';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { changeUserRoles } from '../../server/auth/changeUserRoles';
import { ApiException } from '../api/errors';
import { assertTenantGroup } from '../groups/groupTypes';
import { planTokenTransferRoles, type TokenTransferPlan } from './tokenTransfer';
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

// User-accessible: configured group IDs in which the caller holds
// `kennzeichen.query` (admins receive all). Used by the page to pick a group.
export async function getGroupsWithOebfvConfig(): Promise<string[]> {
  const session = await actionUserRequired();
  const snapshot = await firestore.collection(OEBFV_CONFIG_COLLECTION).get();
  return snapshot.docs
    .filter((d) => !!d.data().tokenEncrypted)
    .map((d) => d.id)
    .filter((groupId) => can(session.user, groupId, 'kennzeichen.query'));
}

// Admin-only: groups that hold a token, for taking one over in another group.
export async function getOebfvTokenGroupIds(): Promise<string[]> {
  await actionAdminRequired();
  const snapshot = await firestore.collection(OEBFV_CONFIG_COLLECTION).get();
  return snapshot.docs.filter((d) => !!d.data().tokenEncrypted).map((d) => d.id);
}

export interface OebfvTokenTransferResult extends TokenTransferPlan {
  /** Noch nicht migrierte Benutzer der Quellgruppe — unverändert. */
  notMigrated: string[];
}

/**
 * Admin-only: moves the ÖBFV token from one group to another and gives every
 * member of the source group who is also a member of the target the role
 * `kennzeichenabfrage` there — so nobody who could query before loses access.
 * See docs/berechtigungen.md.
 */
export async function transferOebfvTokenAction(
  sourceGroupId: string,
  targetGroupId: string,
): Promise<OebfvTokenTransferResult> {
  const session = await actionAdminRequired();
  assertTenantGroup(sourceGroupId);
  assertTenantGroup(targetGroupId);
  if (sourceGroupId === targetGroupId) {
    throw new ApiException('source and target group are the same', {
      status: 400,
    });
  }

  const configs = firestore.collection(OEBFV_CONFIG_COLLECTION);
  const [source, target] = await Promise.all([
    configs.doc(sourceGroupId).get(),
    configs.doc(targetGroupId).get(),
  ]);
  const tokenEncrypted = source.exists
    ? source.data()!.tokenEncrypted
    : undefined;
  if (!tokenEncrypted) {
    throw new ApiException(`group ${sourceGroupId} has no token`, {
      status: 404,
    });
  }
  if (target.exists && target.data()!.tokenEncrypted) {
    throw new ApiException(`group ${targetGroupId} already has a token`, {
      status: 409,
    });
  }

  console.info(
    `moving ÖBFV token from ${sourceGroupId} to ${targetGroupId} (${session.user.email})`,
  );
  await configs.doc(targetGroupId).set({
    groupId: targetGroupId,
    tokenEncrypted,
    updatedAt: new Date().toISOString(),
    updatedBy: session.user.email,
  });
  await configs.doc(sourceGroupId).delete();

  const users = (await firestore.collection(USER_COLLECTION_ID).get()).docs.map(
    (doc) => ({ uid: doc.id, data: doc.data() as UserRolesSource }),
  );
  const notMigrated: string[] = [];
  const migrated = users.filter(({ uid, data }) => {
    if (!awaitsKostenersatzChoice(data)) return true;
    if (Object.prototype.hasOwnProperty.call(effectiveGroupRoles(data), sourceGroupId)) {
      notMigrated.push(uid);
    }
    return false;
  });
  const plan = planTokenTransferRoles(
    migrated.map(({ uid, data }) => ({
      uid,
      groupRoles: effectiveGroupRoles(data),
    })),
    sourceGroupId,
    targetGroupId,
  );
  for (const uid of plan.grant) {
    await changeUserRoles(uid, {
      kind: 'toggleRole',
      groupId: targetGroupId,
      role: 'kennzeichenabfrage',
      enabled: true,
    });
  }
  return { ...plan, notMigrated };
}
