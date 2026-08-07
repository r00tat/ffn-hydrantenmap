import { isFirecallGuest } from '../../common/firecallGuest';
import { UserRecordExtended } from '../../common/users';

export interface UserFilters {
  name: string;
  email: string;
  feuerwehr: string;
  groups: string[];
  /**
   * Einsatz-Gäste (über Share-Link angelegt) einblenden. Standardmäßig `false`:
   * Für jeden erstellten Link entsteht ein Benutzer, der die Liste sonst
   * dominiert.
   */
  showFirecallGuests: boolean;
}

export const defaultUserFilters: UserFilters = {
  name: '',
  email: '',
  feuerwehr: '',
  groups: [],
  showFirecallGuests: false,
};

function contains(value: string | undefined, needle: string): boolean {
  return (value || '').toLowerCase().includes(needle.toLowerCase());
}

export function filterUsers(
  users: UserRecordExtended[],
  filters: UserFilters,
): UserRecordExtended[] {
  return users.filter((user) => {
    if (!filters.showFirecallGuests && isFirecallGuest(user)) {
      return false;
    }
    if (filters.name && !contains(user.displayName, filters.name)) {
      return false;
    }
    if (filters.email && !contains(user.email, filters.email)) {
      return false;
    }
    if (filters.feuerwehr && !contains(user.feuerwehr, filters.feuerwehr)) {
      return false;
    }
    if (filters.groups.length > 0) {
      const userGroups = user.groups || [];
      if (!filters.groups.some((g) => userGroups.includes(g))) {
        return false;
      }
    }
    return true;
  });
}
