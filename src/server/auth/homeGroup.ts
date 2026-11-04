import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { resolveHomeGroupWrite } from '../../common/homeGroup';
import { userMemberGroupIds } from '../../common/userGroupRoles';
import type { FirebaseUserInfo } from '../../common/users';
import { USER_COLLECTION_ID } from '../../components/firebase/firestore';
import { firestore } from '../firebase/admin';

export type HomeGroupResult =
  | { homeGroup: string | undefined }
  | { error: 'notMember' | 'notFound' };

/**
 * Schreibt die Heimatgruppe eines Benutzers. Der einzige Schreibweg für das
 * Feld — der Client darf das Benutzerdokument nicht schreiben (Firestore-Regel).
 *
 * Die Heimatgruppe ist keine Berechtigung und läuft deshalb **nicht** über
 * `writeUserRoles()`. Geprüft wird trotzdem die Mitgliedschaft: Eine
 * Heimatgruppe außerhalb der eigenen Gruppen wäre wirkungslos, weil die
 * Vorauswahl sie übergeht, und stünde nur als Rätsel im Dokument.
 *
 * @param memberGroupIds Mitgliedschaft nach einer gleichzeitigen Änderung
 *   (Benutzerverwaltung). Ohne Angabe gilt das gespeicherte Dokument.
 */
export async function writeHomeGroup(
  uid: string,
  requested: string | null,
  memberGroupIds?: string[],
): Promise<HomeGroupResult> {
  const ref = firestore.collection(USER_COLLECTION_ID).doc(uid);

  let members = memberGroupIds;
  if (!members) {
    const snapshot = await ref.get();
    if (!snapshot.exists) return { error: 'notFound' };
    members = userMemberGroupIds((snapshot.data() ?? {}) as FirebaseUserInfo);
  }

  const write = resolveHomeGroupWrite(requested, members);
  switch (write.action) {
    case 'keep':
      return { homeGroup: undefined };
    case 'invalid':
      return { error: 'notMember' };
    case 'delete':
      await ref.update({ homeGroup: FieldValue.delete() });
      return { homeGroup: undefined };
    case 'set':
      await ref.update({ homeGroup: write.groupId });
      return { homeGroup: write.groupId };
  }
}
