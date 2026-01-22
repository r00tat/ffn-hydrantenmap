import 'server-only';

import { DocumentData } from 'firebase/firestore';
import { UserRecordExtended } from '../../../common/users';
import { firestore, firebaseAuth } from '../../../server/firebase/admin';
import { USER_COLLECTION_ID } from '../../../components/firebase/firestore';

export const listUsers = async (): Promise<UserRecordExtended[]> => {
  const users: UserRecordExtended[] = (
    await firebaseAuth.listUsers(1000)
  ).users.map((u) => u.toJSON() as UserRecordExtended);
  const userDocs = (await firestore.collection(USER_COLLECTION_ID).get()).docs;
  const userDocsMap: { [uid: string]: DocumentData } = {};
  userDocs.forEach((doc) => (userDocsMap[doc.id] = doc.data()));
  users.forEach((u) => {
    // u.authorized = userDocsMap[u.uid]?.authorized || false;
    Object.assign(u, userDocsMap[u.uid]);
  });
  return users;
};

export interface UsersResponse {
  users: UserRecordExtended[];
}
