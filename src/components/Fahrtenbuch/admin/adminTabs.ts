import {
  can,
  canAny,
  type Permission,
  type PermissionUser,
} from '../../../common/permissions';

export type AdminTabKey =
  | 'vehicles'
  | 'settings'
  | 'shareLink'
  | 'pdfImport';

/**
 * Welches Recht jeder Reiter der Fahrtenbuch-Verwaltung verlangt — dasselbe,
 * das die Server Actions dahinter prüfen. Die Reihenfolge ist die Anzeige.
 *
 * Je Reiter ein Recht und nicht je Rolle: Teilt sich die Rolle Gerätemeister
 * einmal auf, ändert sich nur der Katalog, nicht diese Seite.
 */
const TAB_PERMISSIONS: [AdminTabKey, Permission][] = [
  ['vehicles', 'fahrtenbuch.manage'],
  ['settings', 'gruppe.manage'],
  ['shareLink', 'gruppe.manage'],
  ['pdfImport', 'gruppe.manage'],
];

const ADMIN_PAGE_PERMISSIONS = [
  ...new Set(TAB_PERMISSIONS.map(([, perm]) => perm)),
];

/** Die Reiter, die der Benutzer in dieser Gruppe sieht. */
export function fahrtenbuchAdminTabs(
  user: PermissionUser,
  groupId: string | undefined,
): AdminTabKey[] {
  if (!groupId) return [];
  return TAB_PERMISSIONS.filter(([, perm]) => can(user, groupId, perm)).map(
    ([tab]) => tab,
  );
}

/** Hat der Benutzer in irgendeiner Gruppe einen Reiter? Für den Seitenschutz. */
export function canOpenFahrtenbuchAdmin(user: PermissionUser): boolean {
  return ADMIN_PAGE_PERMISSIONS.some((perm) => canAny(user, perm));
}

/** Hat der Benutzer in dieser Gruppe einen Reiter? Für den Gruppen-Umschalter. */
export function canAdministerFahrtenbuch(
  user: PermissionUser,
  groupId: string,
): boolean {
  return ADMIN_PAGE_PERMISSIONS.some((perm) => can(user, groupId, perm));
}
