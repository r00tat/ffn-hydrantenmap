// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { UserRecord } from 'firebase-admin/lib/auth/user-record';
import { DocumentData } from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import adminRequired from '../../server/adminRequired';
import firebaseAdmin from '../../server/firebase/admin';

export interface UserRecordExtended extends UserRecord {
  authorized?: boolean;
  test?: string;
}

const listUsers = async (): Promise<UserRecordExtended[]> => {
  const users: UserRecordExtended[] = (
    await firebaseAdmin.auth().listUsers(1000)
  ).users.map((u) => u.toJSON() as UserRecordExtended);
  const firestore = firebaseAdmin.firestore();
  const userDocs = (await firestore.collection('user').get()).docs;
  const userDocsMap: { [uid: string]: DocumentData } = {};
  userDocs.forEach((doc) => (userDocsMap[doc.id] = doc.data()));
  users.forEach((u) => {
    u.authorized = userDocsMap[u.uid]?.authorized || false;
  });
  return users;
};

export interface UsersResponse {
  users: UserRecordExtended[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
  if (!(await adminRequired(req, res))) {
    return;
  }
  const users = await listUsers();
  res.status(200).json({ users });
}
