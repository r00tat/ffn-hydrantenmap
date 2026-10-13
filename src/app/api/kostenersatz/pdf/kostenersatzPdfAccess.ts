import 'server-only';

import { can } from '../../../../common/permissions';
import type { FirebaseUserInfo } from '../../../../common/users';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../../../components/firebase/firestore';
import { firestore } from '../../../../server/firebase/admin';
import { assertTenantGroup } from '../../../groups/groupTypes';
import { ApiException } from '../../errors';

/**
 * Darf der Benutzer den Kostenersatz dieses Einsatzes als PDF holen? Das
 * Gegenstück zu `actionFirecallPermissionRequired(…, 'kostenersatz.use')` für
 * die PDF-Route, die mit einem Firebase-ID-Token statt einer NextAuth-Sitzung
 * kommt.
 *
 * Die Rollen stehen am Benutzerdokument und nicht im Token: Ein entzogenes
 * Recht wirkt so sofort, ohne dass das Token abläuft. Einsatz-Gäste haben keine
 * Rolle in der Gruppe und kommen deshalb nie durch — das PDF enthält Name,
 * Anschrift und Kontaktdaten des Zahlungspflichtigen.
 *
 * @returns den Einsatz, damit die Route ihn nicht ein zweites Mal liest.
 */
export async function requireKostenersatzForFirecall(
  uid: string,
  firecallId: string,
): Promise<Firecall> {
  const [firecallDoc, userDoc] = await Promise.all([
    firestore.collection(FIRECALL_COLLECTION_ID).doc(firecallId).get(),
    firestore.collection(USER_COLLECTION_ID).doc(uid).get(),
  ]);
  if (!firecallDoc.exists) {
    throw new ApiException(`firecall ${firecallId} does not exist`, {
      status: 404,
    });
  }
  const firecall = firecallDoc.data() as Firecall | undefined;
  const groupId = firecall?.group;
  if (!groupId) {
    throw new ApiException(`firecall ${firecallId} has no group`, {
      status: 403,
    });
  }
  const user = userDoc.data() as FirebaseUserInfo | undefined;
  // Wie im Guard: Ein Recht „in allUsers" gälte für jeden Benutzer. Der
  // globale Admin kommt trotzdem durch, wie in der Regel `hasPerm()`.
  if (!user?.isAdmin) assertTenantGroup(groupId);

  if (
    !can(
      { isAdmin: user?.isAdmin, groupRoles: user?.groupRoles },
      groupId,
      'kostenersatz.use',
    )
  ) {
    throw new ApiException(
      `user ${uid} lacks kostenersatz.use for firecall ${firecallId}`,
      { status: 403 },
    );
  }
  return { ...firecall, id: firecallDoc.id } as Firecall;
}
