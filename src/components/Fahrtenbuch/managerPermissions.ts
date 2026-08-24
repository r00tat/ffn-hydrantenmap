/**
 * Wer im Fahrtenbuch einer Gruppe verwalten darf.
 *
 * Ein eigenes Modul und nicht Teil von `entryLogic.ts`: Diese Prädikate
 * braucht auch der Client (Drawer, Seitenschutz der Verwaltung), und der zöge
 * über `entryLogic` das gesamte Eintrags-Validierungsmodul in sein Bundle.
 */

/** Die Felder der Session, an denen die Entscheidung hängt. */
export interface FahrtenbuchManagerUser {
  isAdmin?: boolean;
  groups?: string[];
  fahrtenbuchGeraetemeister?: string[];
}

/**
 * Darf der Benutzer das Fahrtenbuch dieser Gruppe verwalten — also jeden
 * Eintrag korrigieren und Fahrzeuge und Personen pflegen?
 *
 * Die Asymmetrie ist Absicht: Der Gerätemeister braucht die Mitgliedschaft,
 * der Admin nicht. Verlangte man sie auch vom Admin, nähme man ihm ein Recht,
 * das er heute unter `actionAdminRequired()` in den Stammdaten-Actions hat.
 */
export function isFahrtenbuchManager(
  groupId: string,
  user: FahrtenbuchManagerUser,
): boolean {
  if (user.isAdmin) return true;
  return (
    !!user.groups?.includes(groupId) &&
    !!user.fahrtenbuchGeraetemeister?.includes(groupId)
  );
}

/**
 * Ist der Benutzer irgendwo Gerätemeister? Für die Stellen, die nur wissen
 * müssen, *ob* die Verwaltungsseite erreichbar sein soll, nicht für welche
 * Gruppe — Drawer-Eintrag und Seitenschutz.
 */
export function hasAnyFahrtenbuchManagerRole(
  user: FahrtenbuchManagerUser,
): boolean {
  return !!user.isAdmin || (user.fahrtenbuchGeraetemeister?.length ?? 0) > 0;
}
