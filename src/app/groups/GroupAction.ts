'use server';
import 'server-only';

import { isTenantGroupId } from '../../common/tenantGroups';
import { awaitsKostenersatzChoice } from '../../common/userGroupRoles';
import { changeUserRoles } from '../../server/auth/changeUserRoles';
import {
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired, actionUserRequired } from '../auth';
import { getGroups, getMyGroups, Group, KNOWN_GROUPS } from './groupHelpers';
import { planGroupRoleChanges } from './groupMembership';

export async function getGroupsAction(): Promise<Group[]> {
  await actionUserRequired();

  return await getGroups();
}

export interface GroupUpdateResult {
  groupId: string;
  /**
   * Benutzer, deren Mitgliedschaft oder Gruppen-Admin-Rolle nicht geändert
   * wurde, weil für sie die Kostenersatz-Auswahl der Migration noch aussteht
   * (siehe `awaitsKostenersatzChoice`).
   */
  notMigrated: string[];
}

export async function updateGroupAction(
  group: Group,
  assigendUsers: string[],
  groupAdmins: string[] = []
): Promise<GroupUpdateResult> {
  await actionAdminRequired();

  console.info(
    `${group.id ? 'Updating' : 'Adding'} group ${group.name} ${group.id || ''}`
  );

  // Only pick allowed fields to prevent injection of unexpected properties
  const sanitizedGroup: Omit<Group, 'id'> = {
    name: group.name,
    ...(group.description !== undefined && { description: group.description }),
  };

  let groupId: string;

  if (group.id) {
    const doc = firestore.collection(GROUP_COLLECTION_ID).doc(group.id);
    await doc.set(sanitizedGroup, { merge: true });

    groupId = group.id;
  } else {
    // new doc
    const result = await firestore
      .collection(GROUP_COLLECTION_ID)
      .add(sanitizedGroup);
    groupId = result.id;
  }

  // Mitgliedschaft gibt es nur in Mandanten. `allUsers` hat jeder, und
  // `kostenersatz` ist eine Rolle je Gruppe; Name und Beschreibung dieser
  // Gruppen bleiben trotzdem pflegbar.
  if (!isTenantGroupId(groupId)) return { groupId, notMigrated: [] };

  const users = (await firestore.collection(USER_COLLECTION_ID).get()).docs;
  const changes = planGroupRoleChanges(
    groupId,
    users.map((user) => ({ id: user.id, data: user.data() })),
    assigendUsers,
    groupAdmins
  );
  console.info(
    `group ${group.name}: ${changes
      .map(({ uid, change }) => `${change.kind} ${uid}`)
      .join(', ')}`
  );

  // Über `writeUserRoles()`: Es schreibt Rollen samt Ableitung per Feldpfad,
  // setzt bei Ein- und Austritt die Claims und invalidiert den Session-Cache.
  // Ein Austritt löscht alle Rollen der Gruppe, schlafende Rollen gibt es
  // nicht mehr.
  // Wer noch auf die Kostenersatz-Auswahl der Migration wartet, bleibt
  // unverändert und wird gemeldet; die übrigen Änderungen gelten trotzdem.
  const notMigrated: string[] = [];
  for (const { uid, change, user } of changes) {
    if (awaitsKostenersatzChoice(user)) {
      notMigrated.push(uid);
      continue;
    }
    await changeUserRoles(uid, change, user);
  }

  return { groupId, notMigrated };
}

export async function getMyGroupsFromServer(): Promise<Group[]> {
  const userInfo = await actionUserRequired();

  return userInfo?.user?.id ? getMyGroups(userInfo.user?.id) : [];
}

export async function deleteGroupAction(groupId: string) {
  await actionAdminRequired();

  const doc = firestore.collection(GROUP_COLLECTION_ID).doc(groupId);
  await doc.delete();

  return doc.id;
}

export async function createKnownGroupsAction(): Promise<string[]> {
  await actionAdminRequired();

  const existingGroups = await getGroups();
  const existingIds = new Set(existingGroups.map((g) => g.id));

  const createdGroups: string[] = [];

  for (const knownGroup of KNOWN_GROUPS) {
    if (knownGroup.id && !existingIds.has(knownGroup.id)) {
      const doc = firestore.collection(GROUP_COLLECTION_ID).doc(knownGroup.id);
      await doc.set({
        name: knownGroup.name,
        description: knownGroup.description,
      });
      createdGroups.push(knownGroup.id);
      console.info(`Created known group: ${knownGroup.id} (${knownGroup.name})`);
    }
  }

  return createdGroups;
}
