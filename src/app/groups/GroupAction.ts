'use server';
import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { uniqueArray } from '../../common/arrayUtils';
import { userSessionCache } from '../../server/auth/userSessionCache';
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

export async function updateGroupAction(
  group: Group,
  assigendUsers: string[],
  groupAdmins: string[] = []
) {
  await actionAdminRequired();

  console.info(
    `${group.id ? 'Updating' : 'Adding'} group ${group.name} ${group.id || ''}`
  );

  // Only pick allowed fields to prevent injection of unexpected properties
  const sanitizedGroup: Omit<Group, 'id'> = {
    name: group.name,
    ...(group.description !== undefined && { description: group.description }),
  };

  let groupId: string;

  if (group.id) {
    const doc = firestore.collection(GROUP_COLLECTION_ID).doc(group.id);
    await doc.set(sanitizedGroup, { merge: true });

    groupId = group.id;
  } else {
    // new doc
    const result = await firestore
      .collection(GROUP_COLLECTION_ID)
      .add(sanitizedGroup);
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

  // Gruppen-Admins. Geschrieben wird mit arrayUnion/arrayRemove statt die
  // Liste am Benutzerdokument neu zu setzen: Zwei Admins, die gleichzeitig
  // zwei *verschiedene* Gruppen pflegen, fassen dasselbe Benutzerdokument an
  // und überschrieben sich sonst gegenseitig.
  const memberIds = new Set(assigendUsers);
  // Wer die Gruppe verlässt, verliert dort auch seine Rollen. Ohne das bliebe
  // eine schlafende Rolle stehen, die beim Wiedereintritt in die Gruppe
  // unbemerkt wieder wirksam würde.
  const wantedAdmins = new Set(groupAdmins.filter((uid) => memberIds.has(uid)));
  const currentAdmins = new Set(
    users
      .filter((user) => (user.data().groupAdmin || []).includes(groupId))
      .map((user) => user.id)
  );
  const addAdmins = [...wantedAdmins].filter((uid) => !currentAdmins.has(uid));
  const removeAdmins = [...currentAdmins].filter(
    (uid) => !wantedAdmins.has(uid)
  );
  const removeGeraetemeister = users
    .filter(
      (user) =>
        (user.data().fahrtenbuchGeraetemeister || []).includes(groupId) &&
        !memberIds.has(user.id)
    )
    .map((user) => user.id);

  if (addAdmins.length || removeAdmins.length || removeGeraetemeister.length) {
    const roleBatch = firestore.batch();
    addAdmins.forEach((uid) =>
      roleBatch.set(
        userCollection.doc(uid),
        { groupAdmin: FieldValue.arrayUnion(groupId) },
        { merge: true }
      )
    );
    removeAdmins.forEach((uid) =>
      roleBatch.set(
        userCollection.doc(uid),
        { groupAdmin: FieldValue.arrayRemove(groupId) },
        { merge: true }
      )
    );
    removeGeraetemeister.forEach((uid) =>
      roleBatch.set(
        userCollection.doc(uid),
        { fahrtenbuchGeraetemeister: FieldValue.arrayRemove(groupId) },
        { merge: true }
      )
    );
    await roleBatch.commit();
  }

  // Ohne Invalidierung bliebe jede Änderung an Mitgliedschaft und Rollen bis
  // zum Cache-Ablauf wirkungslos — dieselbe Mechanik wie in updateUser.ts.
  [
    ...addUsers.map((user) => user.id),
    ...removeUsers.map((user) => user.id),
    ...addAdmins,
    ...removeAdmins,
    ...removeGeraetemeister,
  ].forEach((uid) => userSessionCache.invalidate(uid));

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
