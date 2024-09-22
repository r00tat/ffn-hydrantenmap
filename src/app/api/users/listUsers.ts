import { DocumentData } from 'firebase/firestore';
import { UserRecordExtended } from '../../../common/users';
import firebaseAdmin, { firestore } from '../../../server/firebase/admin';

export const listUsers = async (): Promise<UserRecordExtended[]> => {
  const users: UserRecordExtended[] = (
    await firebaseAdmin.auth().listUsers(1000)
  ).users.map((u) => u.toJSON() as UserRecordExtended);
  const userDocs = (await firestore.collection('user').get()).docs;
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