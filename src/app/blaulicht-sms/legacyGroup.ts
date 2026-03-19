/**
 * Appends the legacy env-var group to the list if it has credentials
 * configured via environment variables and isn't already present.
 */
export function appendLegacyGroup(firestoreGroups: string[]): string[] {
  const groups = [...firestoreGroups];
  const legacyGroup = process.env.BLAULICHTSMS_REQUIRED_GROUP ?? 'ffnd';
  if (
    !groups.includes(legacyGroup) &&
    process.env.BLAULICHTSMS_USERNAME &&
    process.env.BLAULICHTSMS_PASSWORD &&
    process.env.BLAULICHTSMS_CUSTOMER_ID
  ) {
    groups.push(legacyGroup);
  }
  return groups;
}
