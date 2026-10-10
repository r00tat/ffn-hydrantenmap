/**
 * Wer die Bekleidung einer Gruppe verwalten darf.
 *
 * Liegt in `common/`, weil Server (Guard) und Client (Drawer, Seitenschutz,
 * Vorwärmen des Caches) dieselbe Entscheidung brauchen.
 */

import {
  hasAnyGroupAdminRole,
  isGroupAdmin,
  type GroupRoleUser,
} from './groupPermissions';

/** Die Felder der Session, an denen die Entscheidung hängt. */
export interface BekleidungUser extends GroupRoleUser {
  bekleidungswart?: string[];
}

/**
 * Darf der Benutzer die Bekleidung dieser Gruppe verwalten?
 *
 * Der Gruppen-Admin schließt den Bekleidungswart ein. Wie beim Gerätemeister
 * braucht der Bekleidungswart die Mitgliedschaft, der globale Admin nicht.
 */
export function isBekleidungswart(
  groupId: string,
  user: BekleidungUser,
): boolean {
  if (isGroupAdmin(groupId, user)) return true;
  return (
    !!groupId &&
    !!user.groups?.includes(groupId) &&
    !!user.bekleidungswart?.includes(groupId)
  );
}

/**
 * Ist der Benutzer irgendwo Bekleidungswart oder Gruppen-Admin? Für Drawer
 * und Seitenschutz, die nur wissen müssen, *ob* die Seite erreichbar ist.
 */
export function hasAnyBekleidungRole(user: BekleidungUser): boolean {
  return hasAnyGroupAdminRole(user) || (user.bekleidungswart?.length ?? 0) > 0;
}
