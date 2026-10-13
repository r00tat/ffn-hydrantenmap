import { isFirecallGuest } from '../../common/firecallGuest';
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
      const others = roles.filter((role) => role !== 'gruppenadmin');
      result.push({
        uid,
        user,
        change: {
          kind: 'setGroupRoles',
          groupId,
          roles: (wantAdmin ? [...others, 'gruppenadmin'] : others).sort() as RoleId[],
        },
      });
    }
  }
  return result;
}
