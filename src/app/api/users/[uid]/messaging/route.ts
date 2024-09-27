import { getMessaging } from 'firebase-admin/messaging';
import type { NextApiRequest, NextApiResponse } from 'next';
import userRequired from '../../../../../server/auth/userRequired';
import { firestore } from '../../../../../server/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { ApiException } from '../../../errors';
import { USER_COLLECTION_ID } from '../../../../../components/firebase/firestore';

export interface UsersResponse {
  // user: UserRecordExtended;
}

export interface RegisterBody {
  token: string;
}

async function handleRegister(uid: string, token: string) {
  const doc = firestore.collection(USER_COLLECTION_ID).doc(`${uid}`);

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

export async function POST(
  req: NextRequest,
  { params: { uid } }: { params: { uid: string } }
) {
  try {
    const authData = await userRequired(req);

    if (uid !== authData.uid) {
      throw new ApiException('wrong userid', { status: 403 });
    }

    const { token }: RegisterBody = await req.json();

    if (!token) {
      throw new ApiException('token is required', { status: 400 });
    }

    const result = await handleRegister(uid, token);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`failed to register token ${err}`, err);
    return NextResponse.json(
      { error: `failed to register token ${err}` },
      { status: err.status || 500 }
    );
  }
}

async function handleUnRegister(uid: string, token: string) {
  const doc = firestore.collection(USER_COLLECTION_ID).doc(`${uid}`);

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

export async function DELETE(
  req: NextRequest,
  // res: NextApiResponse<UsersResponse>
  { params: { uid } }: { params: { uid: string } }
) {
  try {
    const authData = await userRequired(req);

    if (uid !== authData.uid) {
      throw new ApiException('wrong userid', { status: 403 });
    }

    const { token }: RegisterBody = await req.json();

    if (!token) {
      throw new ApiException('token is required', { status: 400 });
    }
    const result = await handleUnRegister(uid, token);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`failed to register token ${err}`, err);
    return NextResponse.json(
      { error: `failed to remove token ${err}` },
      { status: err.status || 500 }
    );
  }
}
