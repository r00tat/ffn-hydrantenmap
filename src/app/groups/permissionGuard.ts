import 'server-only';

import { can, type Permission } from '../../common/permissions';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';
import { ApiException } from '../api/errors';
import { actionUserRequired } from '../auth';
import { assertTenantGroup } from './groupTypes';

/**
 * Stellt sicher, dass der Benutzer das Recht in dieser Gruppe hat — globaler
 * Admin oder eine Rolle der Gruppe, die das Recht enthält.
 *
 * `assertTenantGroup` sperrt die Pseudo-Gruppen auch für den Admin: Ein Recht
 * „in allUsers" gälte für jeden Benutzer.
 *
 * Eigenes Modul statt in `auth.ts`: Dort hängen NextAuth und das
 * Firebase Admin SDK am Import, und diese Sicherheitsgrenze soll für sich
 * testbar sein. `auth.ts` reicht beide Guards weiter.
 */
export async function actionPermissionRequired(
  groupId: string,
  perm: Permission,
) {
  const session = await actionUserRequired();
  assertTenantGroup(groupId);
  if (!can(session.user, groupId, perm)) {
    throw new ApiException(`user lacks ${perm} in group ${groupId}`, {
      status: 403,
    });
  }
  return session;
}

/**
 * Wie `actionPermissionRequired`, aber für die Gruppe eines Einsatzes — für
 * Fachfunktionen am Einsatz wie den Kostenersatz.
 *
 * Einsatz-Gäste kommen hier nie durch: Ihr Zugang ist eine Freigabe auf den
 * Einsatz, keine Mitgliedschaft, und `can()` verlangt eine Rolle in der Gruppe.
 * Den Einsatz selbst sieht, wer Mitglied ist oder globaler Admin; das deckt
 * `can()` mit ab.
 *
 * Anders als bei `actionPermissionRequired` kommt der globale Admin auch an
 * einen Einsatz einer Pseudo-Gruppe (Altbestand mit `group: 'allUsers'`): Die
 * Regel `hasPerm()` lässt ihn die Berechnungen dort lesen und schreiben, also
 * soll er sie auch speichern, drucken und versenden können. Für alle anderen
 * bleibt die Sperre — ein Recht „in allUsers" gälte für jeden.
 *
 * @returns die Sitzung und den Einsatz, damit der Aufrufer ihn nicht ein
 * zweites Mal liest.
 */
export async function actionFirecallPermissionRequired(
  firecallId: string,
  perm: Permission,
) {
  const session = await actionUserRequired();
  const snapshot = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();
  if (!snapshot.exists) {
    throw new ApiException(`firecall ${firecallId} does not exist`, {
      status: 404,
    });
  }
  const data = snapshot.data() as Firecall | undefined;
  const groupId = data?.group;
  if (!groupId) {
    throw new ApiException(`firecall ${firecallId} has no group`, {
      status: 400,
    });
  }
  if (!session.user.isAdmin) assertTenantGroup(groupId);
  if (!can(session.user, groupId, perm)) {
    throw new ApiException(
      `user lacks ${perm} for firecall ${firecallId}`,
      { status: 403 },
    );
  }
  return { session, firecall: { ...data, id: snapshot.id } as Firecall & { id: string } };
}
