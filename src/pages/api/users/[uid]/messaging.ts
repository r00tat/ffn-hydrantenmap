// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import userRequired from '../../../../server/auth/userRequired';
import firebaseAdmin from '../../../../server/firebase/admin';
import { getMessaging } from 'firebase-admin/messaging';

export interface UsersResponse {
  // user: UserRecordExtended;
}

export interface RegisterBody {
  token: string;
}

async function handleRegister(uid: string, token: string) {
  const firestore = firebaseAdmin.firestore();
  const doc = firestore.collection('user').doc(`${uid}`);

  const oldData = (await doc.get()).data();
  const tokens = Array.from(
    new Set<string>([...(oldData?.messaging || []), token])
  );

  const newData = {
    messaging: tokens,
  };

  console.info(`adding messaging token to ${uid}: ${JSON.stringify(newData)}`);

  await doc.set(newData, {
    merge: true,
  });

  const messaging = getMessaging();
  messaging.subscribeToTopic(tokens, 'chat');

  return { ...oldData, ...newData };
}

async function POST(req: NextApiRequest, res: NextApiResponse<UsersResponse>) {
  const authData = await userRequired(req, res);
  if (!authData) {
    return;
  }
  const { uid } = req.query;

  if (uid !== authData.uid) {
    return res.status(403).json({
      error: 'wrong userid',
    });
  }

  const { token }: RegisterBody = req.body;

  if (!token) {
    return res.status(400).json({
      error: 'token is required',
    });
  }

  try {
    const result = await handleRegister(uid, token);

    res.status(200).json(result);
  } catch (err) {
    console.error(`failed to register token ${err}`, err);
    res.status(500).json({ error: `failed to register token ${err}` });
  }
}

async function handleUnRegister(uid: string, token: string) {
  const firestore = firebaseAdmin.firestore();
  const doc = firestore.collection('user').doc(`${uid}`);

  const oldData = (await doc.get()).data();
  const tokens = Array.from(
    new Set<string>([...(oldData?.messaging || []), token])
  );

  const newData = {
    messaging: oldData?.messaging?.filter((t: string) => t !== token) || [],
  };

  console.info(
    `removing messaging token from ${uid}: ${JSON.stringify(newData)}`
  );

  await doc.set(newData, {
    merge: true,
  });

  const messaging = getMessaging();
  messaging.subscribeToTopic(tokens, 'chat');

  return { ...oldData, ...newData };
}

async function DELETE(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
  const authData = await userRequired(req, res);
  if (!authData) {
    return;
  }
  const { uid } = req.query;

  if (uid !== authData.uid) {
    return res.status(403).json({
      error: 'wrong userid',
    });
  }

  const { token }: RegisterBody = req.body;

  if (!token) {
    console.warn(`no token found`);
    return res.status(400).json({
      error: 'token is required',
    });
  }

  try {
    const result = await handleUnRegister(uid, token);

    res.status(200).json(result);
  } catch (err) {
    console.error(`failed to register token ${err}`, err);
    res.status(500).json({ error: `failed to register token ${err}` });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
  switch (req.method) {
    case 'POST':
      return POST(req, res);
    case 'DELETE':
      return DELETE(req, res);
    default:
      console.warn(`method ${req.method} not found`);
      return res.status(404).json({
        error: 'method not found',
      });
  }
}
