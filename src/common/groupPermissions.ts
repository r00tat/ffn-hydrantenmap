/**
 * Gruppenbezogene Administrationsrechte — die einzige Entscheidungsstelle.
 *
 * Liegt in `common/` und nicht bei einem Feature: Die Rolle gilt
 * featureübergreifend, und der Client (Drawer, Seitenschutz, Knöpfe) braucht
 * sie ohne Server-Roundtrip.
 */

/** Die Felder der Session, an denen die Entscheidung hängt. */
export interface GroupRoleUser {
  isAdmin?: boolean;
  groups?: string[];
  groupAdmin?: string[];
}

/**
 * Darf der Benutzer diese Gruppe administrieren?
 *
 * Die Asymmetrie ist Absicht und dieselbe wie in `isFahrtenbuchManager`: Der
 * Gruppen-Admin braucht die Mitgliedschaft, der globale Admin nicht — sonst
 * nähme man ihm ein Recht, das er unter `actionAdminRequired()` immer hatte.
 */
export function isGroupAdmin(groupId: string, user: GroupRoleUser): boolean {
  if (user.isAdmin) return true;
  return (
    !!groupId &&
    !!user.groups?.includes(groupId) &&
    !!user.groupAdmin?.includes(groupId)
  );
}

/**
 * Ist der Benutzer irgendwo Gruppen-Admin? Für die Stellen, die nur wissen
 * müssen, *ob* eine Verwaltungsseite erreichbar sein soll, nicht für welche
 * Gruppe — Drawer-Eintrag und Seitenschutz.
 */
export function hasAnyGroupAdminRole(user: GroupRoleUser): boolean {
  return !!user.isAdmin || (user.groupAdmin?.length ?? 0) > 0;
}
