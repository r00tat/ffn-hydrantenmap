'use server';
import 'server-only';

import { UserRecordExtended } from '../../common/users';
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

export async function updateUserAction(data: UserRecordExtended) {
  await actionAdminRequired();
  return updateUser(data.uid, data);
}
