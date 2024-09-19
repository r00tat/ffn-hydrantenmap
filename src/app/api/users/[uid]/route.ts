import { NextRequest, NextResponse } from 'next/server';
import { feuerwehren } from '../../../../common/feuerwehren';
import { UserRecordExtended } from '../../../../common/users';
import adminRequired from '../../../../server/auth/adminRequired';
import { firestore } from '../../../../server/firebase/admin';

export interface UsersResponse {
  user: UserRecordExtended;
}

export async function updateUser(uid: string, user: UserRecordExtended) {
  const newData = {
    displayName: user.displayName,
    email: user.email,
    authorized: user.authorized,
    feuerwehr: user.feuerwehr || 'neusiedl',
    abschnitt: feuerwehren[user.feuerwehr || 'neusiedl'].abschnitt || 0,
  };

  console.info(`updating ${uid}: ${JSON.stringify(newData)}`);

  await firestore
    .collection('user')
    .doc(`${uid}`)
    .set(
      Object.fromEntries(
        Object.entries(newData).filter(([key, value]) => key && value)
      ),
      {
        merge: true,
      }
    );

  return { ...newData, ...user };
}

export async function POST(
  req: NextRequest,
  { params: { uid } }: { params: { uid: string } }
) {
  try {
    await adminRequired(req);
    const user: UserRecordExtended = await req.json();
    const result = await updateUser(uid, user);

    return NextResponse.json({ user: result });
  } catch (err: any) {
    console.error(`failed update user`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
