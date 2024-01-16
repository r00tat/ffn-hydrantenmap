// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { feuerwehren } from '../../../common/feuerwehren';
import { UserRecordExtended } from '../../../common/users';
import adminRequired from '../../../server/auth/adminRequired';
import { firestore } from '../../../server/firebase/admin';

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
  const newData = {
    displayName: user.displayName,
    email: user.email,
    authorized: user.authorized,
    feuerwehr: user.feuerwehr || 'neusiedl',
    abschnitt: feuerwehren[user.feuerwehr || 'neusiedl'].abschnitt || 0,
  };

  console.info(`updating ${uid}: ${JSON.stringify(newData)}`);

  await firestore.collection('user').doc(`${uid}`).set(newData, {
    merge: true,
  });
  res.status(200).json({ user });
}
