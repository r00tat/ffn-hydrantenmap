// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { UserRecord } from 'firebase-admin/lib/auth/user-record';
import type { NextApiRequest, NextApiResponse } from 'next';
import adminRequired from '../../server/adminRequired';
import firebaseAdmin from '../../server/firebase/admin';

const listUsers = async (): Promise<UserRecord[]> => {
  const users = await firebaseAdmin.auth().listUsers(1000);
  return users.users;
};

export interface UsersResponse {
  users: UserRecord;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
) {
  if (!(await adminRequired(req, res))) {
    return;
  }
  const records = await listUsers();
  res.status(200).json({ users: records });
}
