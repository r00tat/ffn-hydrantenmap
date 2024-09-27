'use server';

import { UserRecordExtended } from '../../common/users';
import {
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired, actionUserRequired } from '../auth';

export interface Group {
  id?: string;
  name: string;
  description?: string;
}

async function getGroups(): Promise<Group[]> {
  const groupDocs = (
    await firestore.collection(GROUP_COLLECTION_ID).orderBy('name', 'asc').get()
  ).docs;
  return groupDocs.map(
    (g) => ({ ...g.data(), name: g.data().name || '', id: g.id } as Group)
  );
}

export async function getGroupsFromServer(): Promise<Group[]> {
  await actionUserRequired();

  return await getGroups();
}

async function updateGroup(group: Group) {
  if (group.id) {
    const doc = firestore.collection(GROUP_COLLECTION_ID).doc(group.id);
    await doc.set(group, { merge: true });
    return doc.id;
  } else {
    // new doc
    const result = await firestore.collection(GROUP_COLLECTION_ID).add(group);
    return result.id;
  }
}

export async function updateGroupFromServer(group: Group) {
  await actionAdminRequired();

  return await updateGroup(group);
}

async function getMyGroups(userId: string): Promise<Group[]> {
  const allGropus = await getGroups();
  const myGroupIds =
    (
      (
        await firestore.collection(USER_COLLECTION_ID).doc(userId).get()
      ).data() as UserRecordExtended
    ).groups || [];
  return allGropus
    .filter((g) => g.id && myGroupIds.includes(g.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMyGroupsFromServer(): Promise<Group[]> {
  const userInfo = await actionUserRequired();

  return userInfo?.user?.image ? getMyGroups(userInfo.user?.image) : [];
}

export async function deleteGroupAction(groupId: string) {
  await actionAdminRequired();

  const doc = firestore.collection(GROUP_COLLECTION_ID).doc(groupId);
  await doc.delete();

  return doc.id;
}
