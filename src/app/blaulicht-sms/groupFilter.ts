/**
 * Filters BlaulichtSMS-configured groups by user membership.
 * Admins bypass the filter and see every configured group; other users
 * only see groups they are a member of.
 */
export function filterGroupsByMembership(
  configuredGroups: string[],
  userGroups: string[],
  isAdmin: boolean,
): string[] {
  if (isAdmin) return [...configuredGroups];
  return configuredGroups.filter((g) => userGroups.includes(g));
}

/**
 * Whether a user may see a given firecall. Admins see every firecall; other
 * users only firecalls of a group they belong to, or the single firecall they
 * hold a guest claim for. Used to avoid leaking firecall ids/names across
 * groups.
 */
export function isAuthorizedForFirecall(
  firecallGroup: string | undefined,
  firecallId: string,
  userGroups: string[],
  userFirecall: string | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (firecallGroup && userGroups.includes(firecallGroup)) return true;
  return userFirecall === firecallId;
}
