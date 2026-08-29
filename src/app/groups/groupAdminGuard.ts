import 'server-only';

import { isGroupAdmin } from '../../common/groupPermissions';
import { ApiException } from '../api/errors';
import { actionUserRequired } from '../auth';
import { assertTenantGroup } from './groupTypes';

/**
 * Stellt sicher, dass der Benutzer diese Gruppe administrieren darf — globaler
 * Admin oder eingetragener Gruppen-Admin mit Mitgliedschaft in der Gruppe.
 *
 * Tritt überall dort an die Stelle von `actionAdminRequired()`, wo eine Action
 * ausschließlich Daten *einer* Gruppe anfasst. `assertTenantGroup` sperrt dabei
 * die Pseudo-Gruppen aus: Einen „Admin von allUsers" darf es nicht geben, denn
 * die Gruppe steht in den Claims jedes Benutzers.
 *
 * Eigenes Modul und nicht in `auth.ts`: Dort hängen NextAuth und das Firebase
 * Admin SDK am Import, und diese Entscheidung ist eine Sicherheitsgrenze, die
 * für sich testbar sein soll. `auth.ts` reicht die Funktion weiter, damit
 * Aufrufer weiterhin alle Guards von dort holen.
 */
export async function actionGroupAdminRequired(groupId: string) {
  const session = await actionUserRequired();
  assertTenantGroup(groupId);
  if (!isGroupAdmin(groupId, session.user)) {
    throw new ApiException(`user may not administer group ${groupId}`, {
      status: 403,
    });
  }
  return session;
}
