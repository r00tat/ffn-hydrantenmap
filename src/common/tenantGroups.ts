/**
 * Gruppen-IDs, die keine Mandanten sind.
 *
 * Liegt in `common/` und nicht in `app/groups/groupTypes.ts`, damit die reine
 * Berechtigungslogik (`permissions.ts`) sie ohne Import aus `app/` nutzen kann.
 * `groupTypes.ts` reicht beide Konstanten unverändert weiter.
 */

/**
 * Pseudo-Gruppe, die jedem Benutzer in die Claims geschrieben wird
 * (`updateUser.ts`) und die auch Einsatz-Gasttokens tragen. Sie ist kein
 * Mandant und darf nie als Fahrtenbuch-Gruppe gelten.
 */
export const ALL_USERS_GROUP_ID = 'allUsers';

/**
 * Group IDs that are capabilities or pseudo-groups rather than brigades
 * ("Mandanten"). Features that let a user pick "their" group — such as the
 * Fahrtenbuch group selector — must filter these out, the same way
 * `ALL_USERS_GROUP_ID` alone used to be filtered before `kostenersatz` was
 * recognised as belonging to the same category.
 */
export const NON_TENANT_GROUP_IDS: string[] = [ALL_USERS_GROUP_ID, 'kostenersatz'];

/** Ist die Gruppen-ID ein echter Mandant? Leere IDs zählen nicht. */
export function isTenantGroupId(groupId: string | undefined): groupId is string {
  return !!groupId && !NON_TENANT_GROUP_IDS.includes(groupId);
}
