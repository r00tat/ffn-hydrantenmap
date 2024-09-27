'use server';
import { isTruthy } from '../../../../common/boolish';
import { feuerwehren } from '../../../../common/feuerwehren';
import { UserRecordExtended } from '../../../../common/users';
import { USER_COLLECTION_ID } from '../../../../components/firebase/firestore';
import { firestore } from '../../../../server/firebase/admin';

export interface UsersResponse {
  user: UserRecordExtended;
}

export async function updateUser(uid: string, user: UserRecordExtended) {
  const newData = {
    displayName: user.displayName,
    email: user.email,
    authorized: isTruthy(user.authorized),
    feuerwehr: user.feuerwehr || 'neusiedl',
    abschnitt: feuerwehren[user.feuerwehr || 'neusiedl'].abschnitt || 0,
    groups: user.groups || [],
  };

  console.info(`updating ${uid}: ${JSON.stringify(newData)}`);

  await firestore
    .collection(USER_COLLECTION_ID)
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
