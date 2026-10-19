import { orderGroupsAsTree } from '../../common/groupHierarchy';
import { ALL_USERS_GROUP_ID, type Group } from './groupTypes';

/**
 * The catch-all "alle Benutzer" group is sorted to the end of every
 * user-facing list. Every authorized user is in it, so listing it first
 * (alphabetical "A...") would push the more specific groups out of view.
 *
 * Re-exported for existing importers; the definition lives in `groupTypes`.
 */
export { ALL_USERS_GROUP_ID };

export function compareGroupsForUser(a: Group, b: Group): number {
  if (a.id === ALL_USERS_GROUP_ID && b.id !== ALL_USERS_GROUP_ID) return 1;
  if (b.id === ALL_USERS_GROUP_ID && a.id !== ALL_USERS_GROUP_ID) return -1;
  return (a.name || '').localeCompare(b.name || '');
}

/**
 * In Baumreihenfolge: Untergruppen direkt unter ihrer Elterngruppe,
 * Geschwister wie oben sortiert.
 */
export function sortGroupsForUser(groups: Group[]): Group[] {
  return orderGroupsAsTree(groups, compareGroupsForUser).map(
    ({ group }) => group
  );
}
