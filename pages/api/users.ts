// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { UserRecord } from 'firebase-admin/lib/auth/user-record';
import type { NextApiRequest, NextApiResponse } from 'next';
import firebaseAdmin from '../../server/firebase/admin';

const listUsers = async (): Promise<UserRecord[]> => {
  const users = await firebaseAdmin.auth().listUsers(1000);
  return users.users;
};

export interface UsersResponse {
  users: UserRecord;
}

const adminRequired = async (
  req: NextApiRequest,
  res: NextApiResponse<any>
) => {
  const { authorization } = req.headers;
  if (!authorization) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (authorization.indexOf(`Bearer `) < 0) {
    res.status(403).json({ error: 'Bearer token required' });
    return false;
  }
  const token = authorization.replace('Bearer ', '');
  try {
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    console.log(`decoded token: ${JSON.stringify(decodedToken)}`);
    return decodedToken;
  } catch (err) {
    console.warn(`invalid token received`);
    return false;
  }
};

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
