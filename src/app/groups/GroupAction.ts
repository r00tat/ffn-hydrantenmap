'use server';
import 'server-only';

import { uniqueArray } from '../../common/arrayUtils';
import {
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';
import {
  CustomClaims,
  setCustomClaimsForUser,
} from '../api/users/[uid]/updateUser';
import { actionAdminRequired, actionUserRequired } from '../auth';
import { getGroups, getMyGroups, Group, KNOWN_GROUPS } from './groupHelpers';

export async function getGroupsAction(): Promise<Group[]> {
  await actionUserRequired();

  return await getGroups();
}

export async function updateGroupAction(group: Group, assigendUsers: string[]) {
  await actionAdminRequired();

  console.info(
    `${group.id ? 'Updating' : 'Adding'} group ${group.name} ${group.id || ''}`
  );

  let groupId: string;

  if (group.id) {
    const doc = firestore.collection(GROUP_COLLECTION_ID).doc(group.id);
    await doc.set(group, { merge: true });

    groupId = group.id;
  } else {
    // new doc
    const result = await firestore.collection(GROUP_COLLECTION_ID).add(group);
    groupId = result.id;
  }

  const userCollection = firestore.collection(USER_COLLECTION_ID);
  const users = (await userCollection.get()).docs || [];
  // update assigned users
  const batch = firestore.batch();

  // users to remove
  const removeUsers = users.filter(
    (user) =>
      (user.data().groups || []).includes(groupId) &&
      !assigendUsers.includes(user.id)
  );
  console.info(
    `removing ${removeUsers.length} from group ${group.name}: ${removeUsers.map(
      (u) => u.data().displayName || u.data().email
    )}`
  );
  removeUsers.forEach((user) =>
    batch.update(userCollection.doc(user.id), {
      groups: (user.data().groups as string[]).filter((id) => id !== groupId),
    })
  );

  // users to add
  const addUsers = users.filter(
    (user) =>
      !(user.data().groups || []).includes(groupId) &&
      assigendUsers.includes(user.id)
  );
  console.info(
    `adding ${addUsers.length} to group ${group.name}: ${addUsers.map(
      (u) => u.data().displayName || u.data().email
    )}`
  );
  addUsers.forEach((user) =>
    batch.update(userCollection.doc(user.id), {
      groups: [...((user.data().groups as string[]) || []), groupId],
    })
  );

  await batch.commit();

  // update claims for users
  await Promise.all(
    [
      ...addUsers.map((user) => ({
        id: user.id,
        ...user.data(),
        groups: uniqueArray([
          ...(user.data().groups || []),
          'allUsers',
          groupId,
        ]),
      })),
      ...removeUsers.map((user) => ({
        id: user.id,
        ...user.data(),
        groups: uniqueArray([...(user.data().groups || []), 'allUsers']).filter(
          (g) => g !== groupId
        ),
      })),
    ].map((user) =>
      setCustomClaimsForUser(user.id, user as unknown as CustomClaims)
    )
  );
  return groupId;
}

export async function getMyGroupsFromServer(): Promise<Group[]> {
  const userInfo = await actionUserRequired();

  return userInfo?.user?.id ? getMyGroups(userInfo.user?.id) : [];
}

export async function deleteGroupAction(groupId: string) {
  await actionAdminRequired();

  const doc = firestore.collection(GROUP_COLLECTION_ID).doc(groupId);
  await doc.delete();

  return doc.id;
}

export async function createKnownGroupsAction(): Promise<string[]> {
  await actionAdminRequired();

  const existingGroups = await getGroups();
  const existingIds = new Set(existingGroups.map((g) => g.id));

  const createdGroups: string[] = [];

  for (const knownGroup of KNOWN_GROUPS) {
    if (knownGroup.id && !existingIds.has(knownGroup.id)) {
      const doc = firestore.collection(GROUP_COLLECTION_ID).doc(knownGroup.id);
      await doc.set({
        name: knownGroup.name,
        description: knownGroup.description,
      });
      createdGroups.push(knownGroup.id);
      console.info(`Created known group: ${knownGroup.id} (${knownGroup.name})`);
    }
  }

  return createdGroups;
}
