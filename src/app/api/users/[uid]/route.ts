import { NextRequest, NextResponse } from 'next/server';
import { feuerwehren } from '../../../../common/feuerwehren';
import { UserRecordExtended } from '../../../../common/users';
import adminRequired from '../../../../server/auth/adminRequired';
import { firestore } from '../../../../server/firebase/admin';

export interface UsersResponse {
  user: UserRecordExtended;
}

export async function POST(
  req: NextRequest,
  { params: { uid } }: { params: { uid: string } }
) {
  try {
    await adminRequired(req);
    const user: UserRecordExtended = await req.json();
    const newData = {
      displayName: user.displayName,
      email: user.email,
      authorized: user.authorized,
      feuerwehr: user.feuerwehr || 'neusiedl',
      abschnitt: feuerwehren[user.feuerwehr || 'neusiedl'].abschnitt || 0,
      groups: user.groups || [],
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
    return NextResponse.json({ user });
  } catch (err: any) {
    console.error(`failed update user`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
