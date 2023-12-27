// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import userRequired from '../../../../server/auth/userRequired';
import firebaseAdmin from '../../../../server/firebase/admin';

export interface UsersResponse {
  // user: UserRecordExtended;
}

export interface RegisterBody {
    token: string;
}

export async function POST(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
const authData = await userRequired(req, res);
  if (!(authData)) {
    return;
  }
  const { uid } = req.query;

  if (uid !== authData.uid){
    return res.status(403).json({
        error: 'wrong userid'
    })
  }

  const {token}: RegisterBody = req.body;

  if (!token){
    return res.status(400).json({
      error: 'token is required'
    })
  }
  

  const firestore = firebaseAdmin.firestore();
  const doc = firestore.collection('user').doc(`${uid}`)

  const oldData = (await doc.get()).data();

  const newData= {
    messaging: [...(oldData?.messaging), token]
  };

  console.info(`updating ${uid}: ${JSON.stringify(newData)}`);

  await doc.set(newData, {
    merge: true,
  });
  res.status(200).json({ ...oldData, ...newData });
}
