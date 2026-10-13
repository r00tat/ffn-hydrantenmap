import 'server-only';

import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import {
  derivePermissionFields,
  isRoleId,
  memberGroupIds,
  ROLES_CATALOG_VERSION,
  type GroupRoles,
  type RoleId,
} from '../../common/permissions';
import { isTenantGroupId } from '../../common/tenantGroups';
import type { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { setCustomClaimsForUser } from '../../app/api/users/[uid]/updateUser';
import { claimsForStoredUser } from '../../common/userGroupRoles';
import { firestore } from '../firebase/admin';
import { userSessionCache } from './userSessionCache';

/**
 * Der einzige Schreibweg für Rollen und ihre Ableitung am Benutzerdokument
 * (`groupRoles`, `groupPerms`, `permsAny`, `rolesCatalogVersion`) und, beim
 * Ein- oder Austritt, für die Claims. Hintergrund: docs/berechtigungen.md.
 *
 * Prüft **nicht**, ob der Aufrufer das darf — das tut die aufrufende Server
 * Action mit `canAssignRole` bzw. `actionAdminRequired`.
 */

export type UserRolesChange =
  /** Rollen einer Gruppe ersetzen; die Mitgliedschaft muss bestehen. */
  | { kind: 'setGroupRoles'; groupId: string; roles: RoleId[] }
  /** In eine Gruppe aufnehmen; ohne `roles` bleiben vorhandene Rollen. */
  | { kind: 'addMember'; groupId: string; roles?: RoleId[] }
  /** Austritt: löscht den Schlüssel und damit alle Rollen der Gruppe. */
  | { kind: 'removeMember'; groupId: string }
  /** Alles ersetzen — Migration und Benutzerverwaltung. */
  | { kind: 'replaceAll'; groupRoles: GroupRoles };

function normalizeRoles(roles: readonly unknown[] | undefined): RoleId[] {
  return [...new Set((roles ?? []).filter(isRoleId))].sort();
}

/** Nur Mandanten, nur bekannte Rollen — so steht es danach im Dokument. */
function normalizeGroupRoles(groupRoles: unknown): GroupRoles {
  const result: GroupRoles = {};
  if (!groupRoles || typeof groupRoles !== 'object') return result;
  for (const [groupId, roles] of Object.entries(groupRoles)) {
    if (!isTenantGroupId(groupId)) continue;
    result[groupId] = normalizeRoles(Array.isArray(roles) ? roles : []);
  }
  return result;
}

function assertTenant(groupId: string) {
  if (!isTenantGroupId(groupId)) {
    throw new Error(`${groupId || '(empty)'} is not a valid group`);
  }
}

function applyChange(before: GroupRoles, change: UserRolesChange): GroupRoles {
  const after: GroupRoles = { ...before };
  switch (change.kind) {
    case 'setGroupRoles':
      assertTenant(change.groupId);
      // Mitglied macht nur `addMember` — sonst nähme ein Gruppen-Admin über
      // die Rollenvergabe Benutzer in seine Gruppe auf.
      if (!Object.prototype.hasOwnProperty.call(before, change.groupId)) {
        throw new Error(`user is not a member of group ${change.groupId}`);
      }
      after[change.groupId] = normalizeRoles(change.roles);
      break;
    case 'addMember':
      assertTenant(change.groupId);
      after[change.groupId] = normalizeRoles(
        change.roles ?? before[change.groupId] ?? [],
      );
      break;
    case 'removeMember':
      assertTenant(change.groupId);
      delete after[change.groupId];
      break;
    case 'replaceAll':
      return normalizeGroupRoles(change.groupRoles);
  }
  return after;
}

function sameMembers(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
}

/**
 * Die Mitgliedschaft vor der Änderung. Ohne `groupRoles` (nicht migriert) gilt
 * das alte Feld `groups` — so ändert die Migration die Claims nicht.
 */
function previousMembers(data: FirebaseUserInfo, before: GroupRoles): string[] {
  if (data.groupRoles) return memberGroupIds({ groupRoles: before });
  return [...new Set((data.groups ?? []).filter(isTenantGroupId))];
}

export async function writeUserRoles(
  uid: string,
  change: UserRolesChange,
): Promise<GroupRoles> {
  const ref = firestore.collection(USER_COLLECTION_ID).doc(uid);

  const { after, data, membershipChanged } = await firestore.runTransaction(
    async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        throw new Error(`user ${uid} does not exist`);
      }
      const data = (snapshot.data() ?? {}) as FirebaseUserInfo;
      const before = normalizeGroupRoles(data.groupRoles);
      const after = applyChange(before, change);
      const { groupPerms, permsAny } = derivePermissionFields(after);

      // Feldpfade je Gruppe statt des ganzen Felds: Zwei Admins, die
      // verschiedene Gruppen pflegen, überschreiben sich nicht. FieldPath statt
      // Punktnotation, weil eine Gruppen-ID einen Punkt enthalten darf.
      const updates: unknown[] = [];
      if (change.kind === 'replaceAll') {
        updates.push(new FieldPath('groupRoles'), after);
        updates.push(new FieldPath('groupPerms'), groupPerms);
      } else {
        for (const groupId of Object.keys(after)) {
          updates.push(new FieldPath('groupPerms', groupId), groupPerms[groupId]);
        }
        const storedPerms = data.groupPerms ?? {};
        for (const groupId of Object.keys(storedPerms)) {
          if (!(groupId in groupPerms)) {
            updates.push(new FieldPath('groupPerms', groupId), FieldValue.delete());
          }
        }
        updates.push(
          new FieldPath('groupRoles', change.groupId),
          change.groupId in after ? after[change.groupId] : FieldValue.delete(),
        );
      }
      updates.push(new FieldPath('permsAny'), permsAny);
      updates.push(new FieldPath('rolesCatalogVersion'), ROLES_CATALOG_VERSION);

      const [first, firstValue, ...rest] = updates;
      tx.update(ref, first as FieldPath, firstValue, ...rest);

      return {
        after,
        data,
        membershipChanged: !sameMembers(
          previousMembers(data, before),
          memberGroupIds({ groupRoles: after }),
        ),
      };
    },
  );

  if (membershipChanged) {
    // Der Claim trägt die Mitgliedschaft, die Regeln für `call/**` lesen ihn.
    // `'kostenersatz'` bleibt drin, solange es in `groups` steht — es fällt
    // erst mit dem Schritt „Alte Felder entfernen" der Migration weg.
    await setCustomClaimsForUser(uid, claimsForStoredUser(data, after));
  }

  userSessionCache.invalidate(uid);
  return after;
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortedPerms(groupPerms: Record<string, unknown[]> | undefined) {
  return Object.fromEntries(
    Object.entries(groupPerms ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupId, perms]) => [groupId, [...(perms ?? [])].sort()]),
  );
}

/**
 * Leitet `groupPerms`/`permsAny` aus `groupRoles` und dem aktuellen Katalog
 * neu ab. Für nicht migrierte Benutzer (ohne `groupRoles`) legt es nichts an.
 *
 * @returns true, wenn etwas geschrieben wurde.
 */
export async function recomputeUserPermissions(uid: string): Promise<boolean> {
  const ref = firestore.collection(USER_COLLECTION_ID).doc(uid);

  const changed = await firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return false;
    const data = (snapshot.data() ?? {}) as FirebaseUserInfo;
    if (!data.groupRoles) return false;

    const { groupPerms, permsAny } = derivePermissionFields(
      normalizeGroupRoles(data.groupRoles),
    );
    const upToDate =
      data.rolesCatalogVersion === ROLES_CATALOG_VERSION &&
      sameJson(sortedPerms(data.groupPerms), sortedPerms(groupPerms)) &&
      sameJson([...(data.permsAny ?? [])].sort(), permsAny);
    if (upToDate) return false;

    tx.update(
      ref,
      new FieldPath('groupPerms'),
      groupPerms,
      new FieldPath('permsAny'),
      permsAny,
      new FieldPath('rolesCatalogVersion'),
      ROLES_CATALOG_VERSION,
    );
    return true;
  });

  if (changed) userSessionCache.invalidate(uid);
  return changed;
}
