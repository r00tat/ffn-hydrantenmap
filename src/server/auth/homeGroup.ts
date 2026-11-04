import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import {
  resolveHomeGroupWrite,
  usersToAssignHomeGroup,
  type HomeGroupUserSource,
} from '../../common/homeGroup';
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

/** Firestore nimmt höchstens 500 Schreibvorgänge je Batch. */
const BATCH_LIMIT = 500;

/**
 * Setzt `groupId` als Heimatgruppe bei allen Mitgliedern der Gruppe — der Knopf
 * in der Gruppenkonfiguration. Überschreibt eine andere Heimatgruppe bewusst:
 * Gedacht ist er für eine Feuerwehr, deren Mitglieder alle hier zu Hause sind
 * und nicht jeder einzeln im Profil nachziehen soll.
 *
 * Gelesen wird das ganze Benutzerverzeichnis, weil die Mitgliedschaft in
 * `groupRoles` als Schlüssel steckt (bzw. im alten Feld `groups`) und sich so
 * nicht abfragen lässt. Bei der Größe einer Feuerwehr ist das unkritisch.
 */
export async function assignHomeGroupToMembers(
  groupId: string,
): Promise<{ updated: number }> {
  const collection = firestore.collection(USER_COLLECTION_ID);
  const snapshot = await collection.get();
  const uids = usersToAssignHomeGroup(
    snapshot.docs.map((doc) => ({
      uid: doc.id,
      data: (doc.data() ?? {}) as HomeGroupUserSource['data'],
    })),
    groupId,
  );

  for (let i = 0; i < uids.length; i += BATCH_LIMIT) {
    const batch = firestore.batch();
    for (const uid of uids.slice(i, i + BATCH_LIMIT)) {
      batch.update(collection.doc(uid), { homeGroup: groupId });
    }
    await batch.commit();
  }
  return { updated: uids.length };
}
