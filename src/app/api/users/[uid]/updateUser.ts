'use server';

import { uniqueArray } from '../../../../common/arrayUtils';
import { isTruthy } from '../../../../common/boolish';
import { feuerwehren } from '../../../../common/feuerwehren';
import { UserRecordExtended } from '../../../../common/users';
import { USER_COLLECTION_ID } from '../../../../components/firebase/firestore';
import { firebaseAuth, firestore } from '../../../../server/firebase/admin';

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
    groups: uniqueArray([...(user.groups || []), 'allUsers']),
  };

  const filteredData = Object.fromEntries(
    Object.entries(newData).filter(([key, value]) => key && value !== undefined)
  );

  console.info(
    `updating user ${uid} (auth: ${user.authorized ? 'Y' : 'N'} ${
      filteredData.authorized ? 'Y' : 'N'
    }): ${JSON.stringify(filteredData)}`
  );

  await firestore
    .collection(USER_COLLECTION_ID)
    .doc(`${uid}`)
    .set(filteredData, {
      merge: true,
    });

  const customClaims = {
    groups: newData.groups,
    // extend with isAdmin
    isAdmin: !!user.isAdmin,
    authorized: !!user.authorized,
  };
  console.info(
    `setting custom claims for ${uid} ${user.email}: ${JSON.stringify(
      customClaims
    )}`
  );
  await firebaseAuth.setCustomUserClaims(uid, customClaims);

  return { ...newData, ...user };
}
