import 'server-only';

import { ApiException } from '../../app/api/errors';
import { actionUserRequired } from '../../app/auth';
import { assertTenantGroup } from '../../app/groups/groupTypes';
import { isMember } from '../../common/permissions';

/**
 * Die Fahrtenbuch-Sperre ist die allgemeine Mandanten-Sperre. Der Name bleibt,
 * weil ihn ein Dutzend Actions verwenden und er dort die Absicht benennt; die
 * Regel selbst steht nur einmal — in `assertTenantGroup`.
 *
 * Der Gruppen-Umschalter im Client filtert dieselbe Liste, das ist aber keine
 * Sicherheitsgrenze — diese Funktion ist es.
 */
export function assertFahrtenbuchGroup(groupId: string) {
  assertTenantGroup(groupId);
}

/**
 * Stellt sicher, dass der angemeldete Benutzer Mitglied der Gruppe ist und
 * dass die Gruppe ein Mandant ist. Admins sind nicht automatisch Mitglied —
 * sie müssen der Gruppe angehören, um Einträge zu erfassen; für die
 * Gruppenverwaltung gilt `actionPermissionRequired(groupId, 'gruppe.manage')`.
 */
export async function actionGroupMemberRequired(groupId: string) {
  const session = await actionUserRequired();
  assertFahrtenbuchGroup(groupId);
  // Ohne `isAdmin`: Hier zählt die Mitgliedschaft laut `groupRoles`, nicht
  // die Asymmetrie von `isMember` zugunsten des globalen Admins.
  if (!isMember({ groupRoles: session.user.groupRoles }, groupId)) {
    throw new ApiException(`user is not a member of group ${groupId}`, {
      status: 403,
    });
  }
  return session;
}
