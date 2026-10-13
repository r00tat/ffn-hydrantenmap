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
