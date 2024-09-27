'use server';

import { UserRecordExtended } from '../../common/users';
import { Firecall } from '../../components/firebase/firestore';
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

export async function setEmptyFirecallGroup() {
  await actionAdminRequired();
  const calls = (await firestore.collection('call').get()).docs.filter(
    (call) => call.data().group === undefined
  );

  await Promise.all(
    calls.map((call) =>
      firestore.collection('call').doc(call.id).update({ group: 'ffnd' })
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
