'use server';

import { UserRecordExtended } from '../../common/users';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired } from '../auth';

export async function setAuthorizedToBool(): Promise<UserRecordExtended[]> {
  await actionAdminRequired();
  const badUsers = await firestore
    .collection('user')
    .where('authorized', '==', 'on')
    .get();
  await Promise.all(
    badUsers.docs.map(async (user) =>
      firestore.collection('user').doc(user.id).update({ authorized: true })
    )
  );
  return badUsers.docs.map(
    (user) =>
      ({ ...user.data(), uid: user.id } as unknown as UserRecordExtended)
  );
}
