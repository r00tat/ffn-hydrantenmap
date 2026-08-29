import 'server-only';

import { ApiException } from '../../app/api/errors';
import { actionUserRequired } from '../../app/auth';
import { assertTenantGroup } from '../../app/groups/groupTypes';
import { isFahrtenbuchManager } from './managerPermissions';

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
 * Gruppenverwaltung gilt `actionGroupAdminRequired()`.
 */
export async function actionGroupMemberRequired(groupId: string) {
  const session = await actionUserRequired();
  assertFahrtenbuchGroup(groupId);
  if (!session.user.groups?.includes(groupId)) {
    throw new ApiException(`user is not a member of group ${groupId}`, {
      status: 403,
    });
  }
  return session;
}

/**
 * Stellt sicher, dass der Benutzer das Fahrtenbuch dieser Gruppe verwalten
 * darf — Admin oder eingetragener Gerätemeister der Gruppe.
 *
 * Tritt an die Stelle von `actionAdminRequired()` in den Fahrzeug- und
 * Personen-Actions. Bewusst *nicht* in den Actions für Gruppeneinstellungen,
 * Mangel-Empfänger, Share-Links und PDF-Import: Die verlangen
 * `actionGroupAdminRequired`, ein blosser Gerätemeister kommt dort nicht hin.
 */
export async function actionFahrtenbuchManagerRequired(groupId: string) {
  const session = await actionUserRequired();
  assertFahrtenbuchGroup(groupId);
  if (!isFahrtenbuchManager(groupId, session.user)) {
    throw new ApiException(
      `user may not manage Fahrtenbuch of group ${groupId}`,
      { status: 403 },
    );
  }
  return session;
}
