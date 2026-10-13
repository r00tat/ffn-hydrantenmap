'use server';
import 'server-only';

import { UserRecordExtended } from '../../common/users';
import { firebaseAuth } from '../../server/firebase/admin';
import { updateUser } from '../api/users/[uid]/updateUser';
import { listUsers } from '../api/users/listUsers';

import { actionAdminRequired } from '../auth';

export async function getUsers() {
  await actionAdminRequired();
  const users = await listUsers();
  console.info(`listed ${users.length} users with server side action`);

  return users.sort((a, b) =>
    `${a.displayName || ''} ${a.email}`?.localeCompare(
      `${b.displayName || ''} ${b.email}`
    )
  );
}

/**
 * @param memberGroupIds Die Gruppen, in denen der Benutzer danach Mitglied
 * ist. Ohne Angabe bleibt die Mitgliedschaft unverändert — etwa beim bloßen
 * Freischalten aus der Liste.
 */
export async function updateUserAction(
  data: UserRecordExtended,
  memberGroupIds?: string[]
) {
  await actionAdminRequired();
  return updateUser(data.uid, data, memberGroupIds);
}

export async function sendPasswordResetEmailAction(email: string) {
  await actionAdminRequired();
  const link = await firebaseAuth.generatePasswordResetLink(email);
  console.info(`generated password reset link for ${email}`);
  return { link };
}

export async function setUserPasswordAction(uid: string, password: string) {
  await actionAdminRequired();
  await firebaseAuth.updateUser(uid, { password });
  console.info(`password set for user ${uid}`);
  return { success: true };
}
