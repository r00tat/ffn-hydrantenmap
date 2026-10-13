/**
 * Vergleichsschlüssel für den Claim `groups` gegen die Gruppen der Sitzung.
 *
 * Die Sitzung leitet `groups` aus `groupRoles` ab und kennt die Schein-Gruppe
 * `kostenersatz` nicht mehr; im Claim bleibt sie bis zum Schritt „Alte Felder
 * entfernen" der Migration stehen. Ohne diese Ausnahme hielte der Client jedes
 * Token eines Kostenersatz-Benutzers für veraltet und erneuerte es endlos.
 */

const LEGACY_CLAIM_ONLY_GROUPS = ['kostenersatz'];

export function claimGroupsKey(groups: readonly string[] | undefined): string {
  return [...new Set(groups ?? [])]
    .filter((group) => !LEGACY_CLAIM_ONLY_GROUPS.includes(group))
    .sort()
    .join(',');
}

/**
 * Muss das Token erneuert werden, weil seine Claims nicht zur Sitzung passen?
 *
 * Vor der Migration (`rolesMigrated === false`) zählt nur die Freischaltung:
 * Die Sitzung kennt dann nur `allUsers`, der Claim die alten Gruppen. Das löst
 * erst die Migration auf — erneuerte Tokens und ein neuer Login änderten
 * nichts, und der Benutzer bekäme nach fünf Versuchen einen Re-Login-Hinweis,
 * der nicht hilft. Unbekannt (`undefined`, etwa offline) heißt: vergleichen
 * wie bisher.
 */
export function claimsNeedRefresh({
  sessionAuthorized,
  tokenAuthorized,
  sessionGroups,
  tokenGroups,
  rolesMigrated,
}: {
  sessionAuthorized: unknown;
  tokenAuthorized: unknown;
  sessionGroups: readonly string[] | undefined;
  tokenGroups: readonly string[] | undefined;
  rolesMigrated: boolean | undefined;
}): boolean {
  if (sessionAuthorized !== tokenAuthorized) return true;
  if (claimGroupsKey(sessionGroups) === claimGroupsKey(tokenGroups)) return false;
  return rolesMigrated !== false;
}
