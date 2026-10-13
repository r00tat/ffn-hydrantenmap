/**
 * Reine Logik der Ansicht „Mitglieder und Rollen" — von Server Actions und
 * Oberfläche gemeinsam benutzt.
 */

import { isFirecallGuest } from '../../common/firecallGuest';
import {
  canAssignRole,
  ROLE_IDS,
  type PermissionUser,
  type RoleId,
} from '../../common/permissions';
import {
  effectiveGroupRoles,
  hasGroupRoles,
  type UserRolesSource,
} from '../../common/userGroupRoles';

export interface MemberSource extends UserRolesSource {
  uid: string;
  displayName?: string;
  email?: string;
  firecall?: string;
}

export interface MemberCandidate {
  uid: string;
  displayName: string;
  email: string;
}

export interface MemberRow extends MemberCandidate {
  roles: RoleId[];
  /**
   * Hat das Dokument schon `groupRoles`? Nicht migrierte Benutzer zeigt die
   * Ansicht mit ihren umgerechneten alten Rollen; die erste Änderung schreibt
   * sie vollständig um (siehe `changeUserRoles`).
   */
  migrated: boolean;
}

function candidate(user: MemberSource): MemberCandidate {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email || user.uid,
    email: user.email || '',
  };
}

function byName(a: MemberCandidate, b: MemberCandidate) {
  return a.displayName.localeCompare(b.displayName);
}

function rolesIn(user: MemberSource, groupId: string): RoleId[] | undefined {
  const groupRoles = effectiveGroupRoles(user);
  return Object.prototype.hasOwnProperty.call(groupRoles, groupId)
    ? groupRoles[groupId]
    : undefined;
}

/**
 * Die Mitglieder der Gruppe. Einsatz-Gäste fehlen: Ihr Zugang ist eine
 * Freigabe auf einen Einsatz, keine Mitgliedschaft.
 */
export function memberRows(users: MemberSource[], groupId: string): MemberRow[] {
  return users
    .filter((user) => !isFirecallGuest(user))
    .flatMap((user) => {
      const roles = rolesIn(user, groupId);
      return roles
        ? [{ ...candidate(user), roles: [...roles], migrated: hasGroupRoles(user) }]
        : [];
    })
    .sort(byName);
}

/** Wer aufgenommen werden kann: Nicht-Mitglieder ohne Gastzugang. */
export function candidateRows(
  users: MemberSource[],
  groupId: string,
): MemberCandidate[] {
  return users
    .filter((user) => !isFirecallGuest(user) && !rolesIn(user, groupId))
    .map(candidate)
    .sort(byName);
}

/** Die Rollenliste mit bzw. ohne `role`, sortiert und eindeutig. */
export function withRole(
  roles: readonly RoleId[],
  role: RoleId,
  enabled: boolean,
): RoleId[] {
  const rest = roles.filter((r) => r !== role);
  return (enabled ? [...rest, role] : rest).sort();
}

/** Welche Rollen darf `actor` in dieser Gruppe vergeben und entziehen? */
export function assignableRoles(
  actor: PermissionUser,
  groupId: string,
): Record<RoleId, boolean> {
  return Object.fromEntries(
    ROLE_IDS.map((role) => [role, canAssignRole(actor, groupId, role)]),
  ) as Record<RoleId, boolean>;
}
