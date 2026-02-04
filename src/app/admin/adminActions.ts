'use server';
import 'server-only';

import { UserRecordExtended } from '../../common/users';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import {
  firestore,
  getDevFirestore,
  getProdFirestore,
} from '../../server/firebase/admin';
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

export interface CopyCollectionResult {
  usersCount: number;
  groupsCount: number;
}

export async function copyUserAndGroupsToDev(): Promise<CopyCollectionResult> {
  await actionAdminRequired();

  console.info(`BULK ACTION: copyUserAndGroupsToDev`);

  const prodDb = getProdFirestore();
  const devDb = getDevFirestore();

  // Copy users collection
  const prodUsers = await prodDb.collection(USER_COLLECTION_ID).get();
  const devUsersRef = devDb.collection(USER_COLLECTION_ID);

  // Delete all existing users in dev
  const existingDevUsers = await devUsersRef.get();
  const deleteUserBatch = devDb.batch();
  existingDevUsers.docs.forEach((doc) => {
    deleteUserBatch.delete(doc.ref);
  });
  await deleteUserBatch.commit();

  // Copy all users from prod to dev
  const userBatch = devDb.batch();
  prodUsers.docs.forEach((doc) => {
    userBatch.set(devUsersRef.doc(doc.id), doc.data());
  });
  await userBatch.commit();

  // Copy groups collection
  const prodGroups = await prodDb.collection(GROUP_COLLECTION_ID).get();
  const devGroupsRef = devDb.collection(GROUP_COLLECTION_ID);

  // Delete all existing groups in dev
  const existingDevGroups = await devGroupsRef.get();
  const deleteGroupBatch = devDb.batch();
  existingDevGroups.docs.forEach((doc) => {
    deleteGroupBatch.delete(doc.ref);
  });
  await deleteGroupBatch.commit();

  // Copy all groups from prod to dev
  const groupBatch = devDb.batch();
  prodGroups.docs.forEach((doc) => {
    groupBatch.set(devGroupsRef.doc(doc.id), doc.data());
  });
  await groupBatch.commit();

  console.info(
    `BULK ACTION COMPLETE: copyUserAndGroupsToDev - ${prodUsers.size} users, ${prodGroups.size} groups`
  );

  return {
    usersCount: prodUsers.size,
    groupsCount: prodGroups.size,
  };
}
