'use server';

import { UserRecordExtended } from '../../common/users';
import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired, actionUserRequired } from '../auth';

export interface Group {
  id?: string;
  name: string;
  description?: string;
}

const GROUP_COLLECTION_ID = 'groups';

async function getGroups(): Promise<Group[]> {
  const groupDocs = (await firestore.collection(GROUP_COLLECTION_ID).get())
    .docs;
  return groupDocs.map(
    (g) => ({ ...g.data(), name: g.data().name || '', id: g.id } as Group)
  );
}

export async function getGroupsFromServer(): Promise<Group[]> {
  await actionUserRequired();

  return await getGroups();
}

export async function updateGroup(group: Group) {
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

export async function getMyGroups(userId: string): Promise<Group[]> {
  const allGropus = await getGroups();
  const myGroupIds =
    (
      (
        await firestore.collection('user').doc(userId).get()
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
