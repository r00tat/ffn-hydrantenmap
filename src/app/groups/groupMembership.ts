import { isFirecallGuest } from '../../common/firecallGuest';
import {
  descendantGroupIds,
  planAncestorMemberships,
  type HierarchyGroup,
} from '../../common/groupHierarchy';
import type { RoleId } from '../../common/permissions';
import {
  effectiveGroupRoles,
  type UserRolesSource,
} from '../../common/userGroupRoles';
import type { UserRolesChange } from '../../server/auth/userRoles';

export interface GroupRoleChange {
  uid: string;
  /** Das gelesene Dokument, damit der Schreibweg es nicht erneut liest. */
  user: UserRolesSource;
  change: UserRolesChange;
}

interface UserDoc {
  id: string;
  data: UserRolesSource & { firecall?: string };
}

/**
 * Die Änderungen, die der Gruppendialog (Mitglieder und Gruppen-Admins) an den
 * Benutzerdokumenten auslöst. Rollen außer `gruppenadmin` bleiben unberührt;
 * die vergibt die Ansicht „Mitglieder und Rollen".
 *
 * Getrennt von `GroupAction.ts`, weil eine `'use server'`-Datei nur
 * asynchrone Funktionen exportieren darf.
 */
export function planGroupRoleChanges(
  groupId: string,
  users: UserDoc[],
  assignedUsers: string[],
  groupAdmins: string[],
): GroupRoleChange[] {
  const assigned = new Set(assignedUsers);
  // Nur Mitglieder können Gruppen-Admin sein.
  const admins = new Set(groupAdmins.filter((uid) => assigned.has(uid)));
  const result: GroupRoleChange[] = [];

  for (const { id: uid, data: user } of users) {
    // Gäste sind an einen Einsatz gebunden, nie an eine Gruppe.
    if (isFirecallGuest(user)) continue;

    const groupRoles = effectiveGroupRoles(user);
    const isMember = Object.prototype.hasOwnProperty.call(groupRoles, groupId);
    const roles: RoleId[] = isMember ? groupRoles[groupId] : [];
    const wantMember = assigned.has(uid);
    const wantAdmin = admins.has(uid);

    if (isMember && !wantMember) {
      result.push({ uid, user, change: { kind: 'removeMember', groupId } });
    } else if (!isMember && wantMember) {
      result.push({
        uid,
        user,
        change: {
          kind: 'addMember',
          groupId,
          roles: wantAdmin ? ['gruppenadmin'] : [],
        },
      });
    } else if (isMember && wantAdmin !== roles.includes('gruppenadmin')) {
      // Nur gruppenadmin umschalten: Die übrigen Rollen liest die Transaktion
      // frisch, statt sie aus dem Stand vom Anfang zurückzuschreiben.
      result.push({
        uid,
        user,
        change: {
          kind: 'toggleRole',
          groupId,
          role: 'gruppenadmin',
          enabled: wantAdmin,
        },
      });
    }
  }
  return result;
}

function memberGroupIdsOf(user: UserRolesSource): string[] {
  return Object.keys(effectiveGroupRoles(user));
}

/**
 * Benutzer, die über eine Untergruppe Mitglied von `groupId` sein müssen. Im
 * Gruppendialog sind sie angehakt und gesperrt; die Server Action behält sie
 * als Mitglieder, auch wenn der Client sie nicht mitschickt.
 */
export function inheritedMemberIds(
  groupId: string,
  users: UserDoc[],
  groups: HierarchyGroup[],
): string[] {
  const descendants = new Set(descendantGroupIds(groupId, groups));
  if (!descendants.size) return [];
  return users
    .filter(
      ({ data }) =>
        !isFirecallGuest(data) &&
        memberGroupIdsOf(data).some((id) => descendants.has(id)),
    )
    .map(({ id }) => id);
}

/**
 * Die Elterngruppen, die nach `changes` je Benutzer noch fehlen. Benutzer aus
 * `skip` (nicht migriert) und Einsatz-Gäste bleiben außen vor.
 */
export function planAncestorChanges(
  users: UserDoc[],
  changes: GroupRoleChange[],
  groups: HierarchyGroup[],
  skip: Set<string> = new Set(),
): { uid: string; groupIds: string[] }[] {
  const changeByUid = new Map(changes.map((c) => [c.uid, c.change]));
  const memberships = users
    .filter(({ id, data }) => !skip.has(id) && !isFirecallGuest(data))
    .map(({ id, data }) => {
      const groupIds = new Set(memberGroupIdsOf(data));
      const change = changeByUid.get(id);
      if (change?.kind === 'addMember') groupIds.add(change.groupId);
      if (change?.kind === 'removeMember') groupIds.delete(change.groupId);
      return { uid: id, groupIds: [...groupIds] };
    });
  return planAncestorMemberships(memberships, groups);
}
