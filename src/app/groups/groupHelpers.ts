import { UserRecordExtended } from '../../common/users';
import {
  GROUP_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../components/firebase/firestore';
import { firestore } from '../../server/firebase/admin';

export interface Group {
  id?: string;
  name: string;
  description?: string;
}

export async function getGroups(): Promise<Group[]> {
  const groupDocs = (
    await firestore.collection(GROUP_COLLECTION_ID).orderBy('name', 'asc').get()
  ).docs;
  return groupDocs.map(
    (g) => ({ ...g.data(), name: g.data().name || '', id: g.id } as Group)
  );
}

export async function getMyGroups(userId: string): Promise<Group[]> {
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
