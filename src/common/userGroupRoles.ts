/**
 * Rollen und Mitgliedschaft eines Benutzerdokuments — für die Verwaltung
 * (Benutzer, Gruppen, „Mitglieder und Rollen"), nicht für Entscheidungen.
 *
 * Anders als die Sitzung (`getUserSessionData`) fällt die Verwaltung für noch
 * nicht migrierte Benutzer auf die alten Felder zurück: Ein Admin, der vor der
 * Migration einen Benutzer bearbeitet, soll dessen Gruppen sehen und sie nicht
 * versehentlich verwerfen. Entschieden wird weiter nur über `groupRoles`.
 */

import { uniqueArray } from './arrayUtils';
import {
  legacyToGroupRoles,
  memberGroupIds,
  type GroupRoles,
  type LegacyRoleFields,
} from './permissions';
import { ALL_USERS_GROUP_ID, isTenantGroupId } from './tenantGroups';

export interface UserRolesSource extends LegacyRoleFields {
  groupRoles?: GroupRoles;
}

const LEGACY_KOSTENERSATZ_GROUP = 'kostenersatz';

/** Trägt das Dokument schon `groupRoles` (auch leer)? */
export function hasGroupRoles(user: UserRolesSource): boolean {
  return (
    !!user.groupRoles &&
    typeof user.groupRoles === 'object' &&
    !Array.isArray(user.groupRoles)
  );
}

/** `groupRoles`, für nicht migrierte Benutzer aus den alten Feldern. */
export function effectiveGroupRoles(user: UserRolesSource): GroupRoles {
  if (!hasGroupRoles(user)) return legacyToGroupRoles(user);
  const result: GroupRoles = {};
  for (const [groupId, roles] of Object.entries(user.groupRoles ?? {})) {
    if (!isTenantGroupId(groupId)) continue;
    result[groupId] = Array.isArray(roles) ? roles : [];
  }
  return result;
}

/** Die Mitgliedsgruppen, wie die Verwaltung sie anzeigt. */
export function userMemberGroupIds(user: UserRolesSource): string[] {
  return memberGroupIds({ groupRoles: effectiveGroupRoles(user) });
}

/**
 * Der Claim `groups`. Ein nicht migrierter Benutzer behält seinen bisherigen
 * Claim, sonst verlöre er mit jeder Bearbeitung die Einsätze seiner Gruppen.
 * `'kostenersatz'` bleibt drin, solange es in `groups` steht — wie in
 * `writeUserRoles()`; es fällt mit „Alte Felder entfernen" weg.
 */
export function claimGroupsForUser(
  user: UserRolesSource,
  groupRoles?: GroupRoles,
): string[] {
  if (!groupRoles && !hasGroupRoles(user)) {
    return uniqueArray([...(user.groups ?? []), ALL_USERS_GROUP_ID]);
  }
  return uniqueArray([
    ...memberGroupIds({ groupRoles: groupRoles ?? effectiveGroupRoles(user) }),
    ALL_USERS_GROUP_ID,
    ...((user.groups ?? []).includes(LEGACY_KOSTENERSATZ_GROUP)
      ? [LEGACY_KOSTENERSATZ_GROUP]
      : []),
  ]);
}
