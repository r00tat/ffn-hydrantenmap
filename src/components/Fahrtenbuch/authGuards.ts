import 'server-only';

import { ApiException } from '../../app/api/errors';
import { actionUserRequired } from '../../app/auth';
import { NON_TENANT_GROUP_IDS } from '../../app/groups/groupTypes';
import { isFahrtenbuchManager } from './managerPermissions';

/**
 * Prüft, ob die Gruppen-ID ein echter Mandant ist — die Sperre für alle
 * Fahrtenbuch-Actions, auch für die Stammdaten-Actions unter
 * `actionAdminRequired()`.
 *
 * Abgelehnt wird jede ID aus `NON_TENANT_GROUP_IDS`:
 * - `allUsers` steht in den Claims jedes Benutzers und in denen von
 *   Einsatz-Gasttokens (die nur für einen einzigen Einsatz gelten). Ein
 *   Fahrtenbuch darunter wäre für jeden Empfänger eines Gastlinks lesbar.
 * - `kostenersatz` ist eine Berechtigungsgruppe ("Zugang zur
 *   Kostenersatz-Funktion") und keine Feuerwehr. Ein Benutzer, der nur darin
 *   ist, bekäme sie sonst als Fahrtenbuch-Mandanten.
 *
 * Der Gruppen-Umschalter im Client filtert dieselbe Liste, das ist aber keine
 * Sicherheitsgrenze — diese Funktion ist es. Dieselbe Sperre steht in
 * `fahrtenbuchMember()` in den Firestore-Regeln.
 */
export function assertFahrtenbuchGroup(groupId: string) {
  if (!groupId) {
    throw new ApiException('groupId missing', { status: 400 });
  }
  if (NON_TENANT_GROUP_IDS.includes(groupId)) {
    throw new ApiException(`${groupId} is not a valid Fahrtenbuch group`, {
      status: 400,
    });
  }
}

/**
 * Stellt sicher, dass der angemeldete Benutzer Mitglied der Gruppe ist und
 * dass die Gruppe ein Mandant ist. Admins sind nicht automatisch Mitglied —
 * sie müssen der Gruppe angehören, um Einträge zu erfassen; für Stammdaten
 * gilt `actionAdminRequired()` zusammen mit `assertFahrtenbuchGroup()`.
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
 * Mangel-Empfänger, Share-Links und PDF-Import: Die bleiben admin-only, und
 * nur ein Admin vergibt die Rolle selbst.
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
