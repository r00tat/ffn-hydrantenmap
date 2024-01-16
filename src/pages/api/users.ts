// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { DocumentData } from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import { UserRecordExtended } from '../../common/users';
import adminRequired from '../../server/auth/adminRequired';
import firebaseAdmin, { firestore } from '../../server/firebase/admin';
import { ErrorResponse } from './responses';

const listUsers = async (): Promise<UserRecordExtended[]> => {
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse | ErrorResponse>
) {
  try {
    if (!(await adminRequired(req, res))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const users = await listUsers();
    res.status(200).json({ users });
  } catch (err: any) {
    console.error(`/api/users failed: ${err}\n${err.stack}`);
    res.status(500).json({ error: err.message });
  }
}
