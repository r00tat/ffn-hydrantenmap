import type { Group } from './groupTypes';

/**
 * The catch-all "alle Benutzer" group is sorted to the end of every
 * user-facing list. Every authorized user is in it, so listing it first
 * (alphabetical "A...") would push the more specific groups out of view.
 */
export const ALL_USERS_GROUP_ID = 'allUsers';

export function compareGroupsForUser(a: Group, b: Group): number {
  if (a.id === ALL_USERS_GROUP_ID && b.id !== ALL_USERS_GROUP_ID) return 1;
  if (b.id === ALL_USERS_GROUP_ID && a.id !== ALL_USERS_GROUP_ID) return -1;
  return (a.name || '').localeCompare(b.name || '');
}

export function sortGroupsForUser(groups: Group[]): Group[] {
  return [...groups].sort(compareGroupsForUser);
}
