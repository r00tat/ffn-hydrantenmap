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
