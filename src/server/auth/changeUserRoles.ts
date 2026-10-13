import 'server-only';

import { memberGroupIds, type GroupRoles } from '../../common/permissions';
import { isTenantGroupId } from '../../common/tenantGroups';
import {
  effectiveGroupRoles,
  hasGroupRoles,
  type UserRolesSource,
} from '../../common/userGroupRoles';
import type { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';
import { writeUserRoles, type UserRolesChange } from './userRoles';

/**
 * Rollenänderungen aus der Verwaltung (Benutzer, Gruppen, „Mitglieder und
 * Rollen") — ein dünner Vorbau vor `writeUserRoles()`.
 *
 * Der Grund ist das Zeitfenster vor der Migration: `writeUserRoles()` schreibt
 * je Gruppe per Feldpfad. Bei einem Benutzer ohne `groupRoles` bliebe danach
 * nur die eine bearbeitete Gruppe stehen; er verlöre seine übrigen Gruppen
 * und Rollen, und die Migration überspränge ihn als „bereits migriert". Für
 * solche Benutzer wird die Änderung deshalb auf die umgerechneten alten Felder
 * angewandt und als Ganzes geschrieben.
 *
 * Prüft wie `writeUserRoles()` **nicht**, ob der Aufrufer das darf.
 */

function hasKey(groupRoles: GroupRoles, groupId: string) {
  return Object.prototype.hasOwnProperty.call(groupRoles, groupId);
}

export function planUserRolesChange(
  user: UserRolesSource,
  change: UserRolesChange,
): UserRolesChange {
  if (hasGroupRoles(user) || change.kind === 'replaceAll') return change;

  const groupRoles = { ...effectiveGroupRoles(user) };
  switch (change.kind) {
    case 'setGroupRoles':
      if (!hasKey(groupRoles, change.groupId)) {
        throw new Error(`user is not a member of group ${change.groupId}`);
      }
      groupRoles[change.groupId] = change.roles;
      break;
    case 'addMember':
      groupRoles[change.groupId] =
        change.roles ?? groupRoles[change.groupId] ?? [];
      break;
    case 'removeMember':
      delete groupRoles[change.groupId];
      break;
  }
  return { kind: 'replaceAll', groupRoles };
}

/**
 * Die Schritte, die die Mitgliedschaft auf `desiredGroupIds` bringen. Rollen
 * verbleibender Gruppen bleiben stehen; neue Gruppen beginnen ohne Rolle.
 * Ohne Unterschied entsteht nichts — auch keine nebenbei migrierten Benutzer.
 */
export function planMembershipChanges(
  user: UserRolesSource,
  desiredGroupIds: string[],
): UserRolesChange[] {
  const current = effectiveGroupRoles(user);
  const members = memberGroupIds({ groupRoles: current });
  const desired = [...new Set(desiredGroupIds.filter(isTenantGroupId))];

  const removed = members.filter((groupId) => !desired.includes(groupId));
  const added = desired.filter((groupId) => !members.includes(groupId));
  if (!removed.length && !added.length) return [];

  if (!hasGroupRoles(user)) {
    const groupRoles: GroupRoles = {};
    for (const groupId of desired) groupRoles[groupId] = current[groupId] ?? [];
    return [{ kind: 'replaceAll', groupRoles }];
  }
  return [
    ...removed.map((groupId) => ({ kind: 'removeMember' as const, groupId })),
    ...added.map((groupId) => ({ kind: 'addMember' as const, groupId })),
  ];
}

async function readUser(uid: string): Promise<FirebaseUserInfo> {
  const snapshot = await firestore.collection(USER_COLLECTION_ID).doc(uid).get();
  if (!snapshot.exists) {
    throw new Error(`user ${uid} does not exist`);
  }
  return (snapshot.data() ?? {}) as FirebaseUserInfo;
}

/**
 * Eine Rollenänderung schreiben. `user` spart den Lesezugriff, wenn der
 * Aufrufer das Dokument ohnehin schon hat (etwa die Gruppenverwaltung, die
 * alle Benutzer liest).
 */
export async function changeUserRoles(
  uid: string,
  change: UserRolesChange,
  user?: UserRolesSource,
): Promise<GroupRoles> {
  const source = user ?? (await readUser(uid));
  return writeUserRoles(uid, planUserRolesChange(source, change));
}

/** Die Mitgliedschaft auf genau diese Gruppen setzen. */
export async function setUserMemberships(
  uid: string,
  desiredGroupIds: string[],
  user?: UserRolesSource,
): Promise<GroupRoles> {
  const source = user ?? (await readUser(uid));
  let result = effectiveGroupRoles(source);
  // Nacheinander, weil jede Änderung dasselbe Dokument anfasst.
  for (const change of planMembershipChanges(source, desiredGroupIds)) {
    result = await writeUserRoles(uid, change);
  }
  return result;
}
