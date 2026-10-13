'use server';
import 'server-only';

import { isFirecallGuest } from '../../common/firecallGuest';
import {
  canAssignRole,
  isRoleId,
  type RoleId,
} from '../../common/permissions';
import {
  awaitsKostenersatzChoice,
  effectiveGroupRoles,
  type UserRolesSource,
} from '../../common/userGroupRoles';
import {
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import {
  assignableRoles,
  candidateRows,
  memberRows,
  withRole,
  type MemberCandidate,
  type MemberRow,
  type MemberSource,
} from '../../components/groups/memberRoles';
import { changeUserRoles } from '../../server/auth/changeUserRoles';
import { firestore } from '../../server/firebase/admin';
import { ApiException } from '../api/errors';
import { listUsers } from '../api/users/listUsers';
import { actionAdminRequired, actionPermissionRequired } from '../auth';
import { assertTenantGroup } from './groupTypes';

export interface MemberRolesData {
  groupName: string;
  members: MemberRow[];
  /** Nur für den globalen Admin befüllt — nur er nimmt Mitglieder auf. */
  candidates: MemberCandidate[];
  assignable: Record<RoleId, boolean>;
  canManageMembers: boolean;
}

export type MemberRolesError =
  | 'forbidden'
  | 'invalidRole'
  | 'notAMember'
  | 'unknownUser'
  | 'firecallGuest'
  /** Wartet noch auf die Kostenersatz-Auswahl der Migration (Schritt 2). */
  | 'notMigrated';

export type MemberRolesResult<T = object> =
  | ({ success: true } & T)
  | { success: false; error: MemberRolesError };

type UserDoc = UserRolesSource & { firecall?: string };

async function requireGroupName(groupId: string): Promise<string> {
  const snapshot = await firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .get();
  if (!snapshot.exists) {
    throw new ApiException(`group ${groupId} does not exist`, { status: 404 });
  }
  return (snapshot.data() as { name?: string } | undefined)?.name || groupId;
}

async function readUser(uid: string): Promise<UserDoc | undefined> {
  const snapshot = await firestore.collection(USER_COLLECTION_ID).doc(uid).get();
  return snapshot.exists ? (snapshot.data() as UserDoc) : undefined;
}

function rolesInGroup(user: UserDoc, groupId: string): RoleId[] | undefined {
  const groupRoles = effectiveGroupRoles(user);
  return Object.prototype.hasOwnProperty.call(groupRoles, groupId)
    ? groupRoles[groupId]
    : undefined;
}

/** Mitglieder samt Rollen einer Gruppe für die Ansicht „Mitglieder und Rollen". */
export async function getMemberRolesAction(
  groupId: string,
): Promise<MemberRolesData> {
  const session = await actionPermissionRequired(groupId, 'rollen.assign');
  const groupName = await requireGroupName(groupId);

  const users = (await listUsers()) as unknown as MemberSource[];
  const isAdmin = !!session.user.isAdmin;

  return {
    groupName,
    members: memberRows(users, groupId),
    candidates: isAdmin ? candidateRows(users, groupId) : [],
    assignable: assignableRoles(session.user, groupId),
    canManageMembers: isAdmin,
  };
}

/**
 * Vergibt oder entzieht eine Rolle. Wer was vergeben darf, entscheidet
 * `canAssignRole` (Teilmengenregel, `gruppenadmin` nur der globale Admin) —
 * hier noch einmal geprüft, weil die Oberfläche nur ein Hinweis ist.
 */
export async function setMemberRoleAction(
  groupId: string,
  uid: string,
  role: RoleId,
  enabled: boolean,
): Promise<MemberRolesResult<{ roles: RoleId[] }>> {
  const session = await actionPermissionRequired(groupId, 'rollen.assign');
  if (!isRoleId(role)) return { success: false, error: 'invalidRole' };
  if (!canAssignRole(session.user, groupId, role)) {
    return { success: false, error: 'forbidden' };
  }

  const user = await readUser(uid);
  // Rollen nur an Mitglieder: Sonst nähme ein Gruppen-Admin über die
  // Rollenvergabe Benutzer in die Gruppe auf, was dem Admin vorbehalten ist.
  const current = user && !isFirecallGuest(user) ? rolesInGroup(user, groupId) : undefined;
  if (!user || !current) return { success: false, error: 'notAMember' };
  if (awaitsKostenersatzChoice(user)) {
    return { success: false, error: 'notMigrated' };
  }

  const roles = withRole(current, role, enabled);
  const unchanged =
    roles.length === current.length && roles.every((r) => current.includes(r));
  if (unchanged) return { success: true, roles };

  // Nur die eine Rolle umschalten, nicht die hier gelesene Liste schreiben:
  // Ändert gleichzeitig jemand anderes die Rollen, gälte sonst die veraltete
  // Liste — ein soeben entzogenes Recht käme zurück.
  const groupRoles = await changeUserRoles(
    uid,
    { kind: 'toggleRole', groupId, role, enabled },
    user,
  );
  return { success: true, roles: groupRoles[groupId] ?? roles };
}

/** Nimmt einen Benutzer ohne Rolle in die Gruppe auf — nur der globale Admin. */
export async function addMemberAction(
  groupId: string,
  uid: string,
): Promise<MemberRolesResult> {
  await actionAdminRequired();
  assertTenantGroup(groupId);
  await requireGroupName(groupId);

  const user = await readUser(uid);
  if (!user) return { success: false, error: 'unknownUser' };
  // Ein Gast-Zugang ist eine Freigabe auf einen Einsatz; ihn zum Mitglied zu
  // machen, gäbe einem Gastlink-Empfänger die ganze Gruppe.
  if (isFirecallGuest(user)) return { success: false, error: 'firecallGuest' };
  if (awaitsKostenersatzChoice(user)) {
    return { success: false, error: 'notMigrated' };
  }

  await changeUserRoles(uid, { kind: 'addMember', groupId }, user);
  return { success: true };
}

/** Entfernt einen Benutzer samt aller Rollen aus der Gruppe — nur der globale Admin. */
export async function removeMemberAction(
  groupId: string,
  uid: string,
): Promise<MemberRolesResult> {
  await actionAdminRequired();
  assertTenantGroup(groupId);

  const user = await readUser(uid);
  if (!user) return { success: false, error: 'unknownUser' };
  if (awaitsKostenersatzChoice(user)) {
    return { success: false, error: 'notMigrated' };
  }

  await changeUserRoles(uid, { kind: 'removeMember', groupId }, user);
  return { success: true };
}
