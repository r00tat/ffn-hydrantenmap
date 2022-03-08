// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { UserRecord } from 'firebase-admin/lib/auth/user-record';
import { DocumentData } from 'firebase/firestore';
import type { NextApiRequest, NextApiResponse } from 'next';
import adminRequired from '../../../server/adminRequired';
import firebaseAdmin from '../../../server/firebase/admin';

export interface UserRecordExtended extends UserRecord {
  authorized?: boolean;
  test?: string;
}

export interface UsersResponse {
  user: UserRecordExtended;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
  if (!(await adminRequired(req, res))) {
    return;
  }
  const { uid } = req.query;
  const user: UserRecordExtended = req.body;

  const firestore = firebaseAdmin.firestore();
  await firestore.collection('user').doc(`${uid}`).set(
    {
      displayName: user.displayName,
      email: user.email,
      authorized: user.authorized,
    },
    {
      merge: true,
    }
  );
  res.status(200).json({ user });
}
