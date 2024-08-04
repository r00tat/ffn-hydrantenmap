'use server';

import { firestore } from '../../server/firebase/admin';
import { checkAuth } from '../auth';

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
  checkAuth();

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
  checkAuth();

  return await updateGroup(group);
}
