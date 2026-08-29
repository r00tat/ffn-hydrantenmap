/**
 * Wer im Fahrtenbuch einer Gruppe verwalten darf.
 *
 * Ein eigenes Modul und nicht Teil von `entryLogic.ts`: Diese Prädikate
 * braucht auch der Client (Drawer, Seitenschutz der Verwaltung), und der zöge
 * über `entryLogic` das gesamte Eintrags-Validierungsmodul in sein Bundle.
 */

import {
  hasAnyGroupAdminRole,
  isGroupAdmin,
  type GroupRoleUser,
} from '../../common/groupPermissions';

/** Die Felder der Session, an denen die Entscheidung hängt. */
export interface FahrtenbuchManagerUser extends GroupRoleUser {
  fahrtenbuchGeraetemeister?: string[];
}

/**
 * Darf der Benutzer das Fahrtenbuch dieser Gruppe verwalten — also jeden
 * Eintrag korrigieren und Fahrzeuge und Personen pflegen?
 *
 * Der Gruppen-Admin schließt den Gerätemeister ein: Er darf alles, was
 * gruppenbezogen administrativ ist, und das Fahrtenbuch gehört dazu.
 *
 * Die Asymmetrie ist Absicht: Der Gerätemeister braucht die Mitgliedschaft,
 * der Admin nicht. Verlangte man sie auch vom Admin, nähme man ihm ein Recht,
 * das er heute unter `actionAdminRequired()` in den Stammdaten-Actions hat.
 * Für den Gruppen-Admin steckt dieselbe Regel in `isGroupAdmin`.
 */
export function isFahrtenbuchManager(
  groupId: string,
  user: FahrtenbuchManagerUser,
): boolean {
  if (isGroupAdmin(groupId, user)) return true;
  return (
    !!user.groups?.includes(groupId) &&
    !!user.fahrtenbuchGeraetemeister?.includes(groupId)
  );
}

/**
 * Ist der Benutzer irgendwo Gerätemeister oder Gruppen-Admin? Für die Stellen,
 * die nur wissen müssen, *ob* die Verwaltungsseite erreichbar sein soll, nicht
 * für welche Gruppe — Drawer-Eintrag und Seitenschutz.
 */
export function hasAnyFahrtenbuchManagerRole(
  user: FahrtenbuchManagerUser,
): boolean {
  return (
    hasAnyGroupAdminRole(user) ||
    (user.fahrtenbuchGeraetemeister?.length ?? 0) > 0
  );
}
