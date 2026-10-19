'use server';
import 'server-only';

import {
  isValidParent,
  type HierarchyGroup,
} from '../../common/groupHierarchy';
import { isTenantGroupId } from '../../common/tenantGroups';
import { awaitsKostenersatzChoice } from '../../common/userGroupRoles';
import { changeUserRoles } from '../../server/auth/changeUserRoles';
import {
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';
import { ApiException } from '../api/errors';
import { actionAdminRequired, actionUserRequired } from '../auth';
import { getGroups, getMyGroups, Group, KNOWN_GROUPS } from './groupHelpers';
import {
  inheritedMemberIds,
  planAncestorChanges,
  planGroupRoleChanges,
} from './groupMembership';

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

  const allGroups = await getGroups();
  // `undefined` lässt eine gespeicherte Elterngruppe stehen, ein leerer Wert
  // entfernt sie.
  const parentId =
    group.parentId === undefined ? undefined : group.parentId || null;
  if (!isValidParent(group.id, parentId, allGroups)) {
    throw new ApiException(`invalid parent group ${parentId}`, { status: 400 });
  }

  // Only pick allowed fields to prevent injection of unexpected properties
  const sanitizedGroup: Omit<Group, 'id'> = {
    name: group.name,
    ...(group.description !== undefined && { description: group.description }),
    ...(parentId !== undefined && { parentId }),
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

  const groups: HierarchyGroup[] = [
    ...allGroups.filter((g) => g.id !== groupId),
    // Wie nach dem `merge: true` oben: eine nicht übergebene Elterngruppe bleibt.
    { ...allGroups.find((g) => g.id === groupId), ...sanitizedGroup, id: groupId },
  ];
  const userDocs = (await firestore.collection(USER_COLLECTION_ID).get()).docs
    .map((user) => ({ id: user.id, data: user.data() }));
  // Wer über eine Untergruppe Mitglied ist, bleibt es — auch wenn der Client
  // ihn nicht mitschickt.
  const changes = planGroupRoleChanges(
    groupId,
    userDocs,
    [...assigendUsers, ...inheritedMemberIds(groupId, userDocs, groups)],
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

  // Mitglieder einer Gruppe sind auch Mitglied aller Elterngruppen. Das gilt
  // für neu aufgenommene Mitglieder ebenso wie für alle Mitglieder einer
  // Gruppe, die gerade unter eine andere gehängt wurde. Frisch gelesen statt
  // mit dem Dokument von oben, das die Änderung davor noch nicht kennt.
  const skip = new Set(
    userDocs.filter(({ data }) => awaitsKostenersatzChoice(data)).map(({ id }) => id)
  );
  for (const { uid, groupIds } of planAncestorChanges(
    userDocs,
    changes,
    groups,
    skip
  )) {
    for (const ancestorId of groupIds) {
      await changeUserRoles(uid, { kind: 'addMember', groupId: ancestorId });
    }
  }

  return { groupId, notMigrated };
}

export async function getMyGroupsFromServer(): Promise<Group[]> {
  const userInfo = await actionUserRequired();

  return userInfo?.user?.id ? getMyGroups(userInfo.user?.id) : [];
}

export async function deleteGroupAction(groupId: string) {
  await actionAdminRequired();

  // Untergruppen rücken eine Ebene nach oben, statt auf eine Gruppe zu
  // zeigen, die es nicht mehr gibt.
  const groups = await getGroups();
  const deleted = groups.find((g) => g.id === groupId);
  for (const child of groups.filter((g) => g.parentId === groupId)) {
    await firestore
      .collection(GROUP_COLLECTION_ID)
      .doc(child.id!)
      .set({ parentId: deleted?.parentId ?? null }, { merge: true });
  }

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
