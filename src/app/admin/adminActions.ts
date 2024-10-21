'use server';

import { uniqueArray } from '../../common/arrayUtils';
import { UserRecordExtended } from '../../common/users';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firebaseAuth, firestore } from '../../server/firebase/admin';
import { setCustomClaimsForUser } from '../api/users/[uid]/updateUser';
import { actionAdminRequired } from '../auth';

export async function setAuthorizedToBool(): Promise<UserRecordExtended[]> {
  await actionAdminRequired();
  const badUsers = await firestore
    .collection(USER_COLLECTION_ID)
    .where('authorized', '==', 'on')
    .get();
  await Promise.all(
    badUsers.docs.map(async (user) =>
      firestore
        .collection(USER_COLLECTION_ID)
        .doc(user.id)
        .update({ authorized: true })
    )
  );
  return badUsers.docs.map(
    (user) =>
      ({ ...user.data(), uid: user.id } as unknown as UserRecordExtended)
  );
}

export async function setEmptyFirecallGroup() {
  await actionAdminRequired();
  const calls = (
    await firestore.collection(FIRECALL_COLLECTION_ID).get()
  ).docs.filter((call) => call.data().group === undefined);

  await Promise.all(
    calls.map((call) =>
      firestore
        .collection(FIRECALL_COLLECTION_ID)
        .doc(call.id)
        .update({ group: 'ffnd' })
    )
  );

  return calls.map(
    (call) =>
      ({
        ...call.data(),
        id: call.id,
      } as unknown as Firecall)
  );
}

export async function setCustomClaimsForAllUsers() {
  await actionAdminRequired();

  console.info(`BULK ACTION: setCustomClaimsForAllUsers`);

  const authorizedUsers = await firestore
    .collection(USER_COLLECTION_ID)
    .where('authorized', '==', true)
    .get();
  await Promise.all(
    authorizedUsers.docs.map(async (user) => {
      return setCustomClaimsForUser(user.id, {
        authorized: true,
        isAdmin: user.data().isAdmin,
        groups: user.data().groups || [],
      });
    })
  );
  console.info(`BULK ACTION COMPLETE: setCustomClaimsForAllUsers`);
  return authorizedUsers.docs.map(
    (user) =>
      ({
        name: user.data().name,
        email: user.data().email,
        uid: user.id,
      } as unknown as UserRecordExtended)
  );
}
