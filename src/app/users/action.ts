'use server';
import 'server-only';

import { UserRecordExtended } from '../../common/users';
import { updateUser } from '../api/users/[uid]/updateUser';
import { listUsers } from '../api/users/listUsers';
import { firebaseAuth } from '../../server/firebase/admin';

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

export async function updateUserAction(data: UserRecordExtended) {
  await actionAdminRequired();
  return updateUser(data.uid, data);
}

export async function setUserPasswordAction(uid: string, password: string) {
  await actionAdminRequired();

  if (!password || password.length < 6) {
    return { error: 'Passwort muss mindestens 6 Zeichen lang sein.' };
  }

  try {
    await firebaseAuth.updateUser(uid, { password });
    return { success: true };
  } catch (err: any) {
    console.error(`failed to set password for user ${uid}`, err);
    return { error: err.message || 'Fehler beim Setzen des Passworts.' };
  }
}
