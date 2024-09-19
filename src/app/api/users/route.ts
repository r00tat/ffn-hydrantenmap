import { DocumentData } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { UserRecordExtended } from '../../../common/users';
import adminRequired from '../../../server/auth/adminRequired';
import firebaseAdmin, { firestore } from '../../../server/firebase/admin';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';

export const listUsers = async (): Promise<UserRecordExtended[]> => {
  const users: UserRecordExtended[] = (
    await firebaseAdmin.auth().listUsers(1000)
  ).users.map((u) => u.toJSON() as UserRecordExtended);
  const userDocs = (await firestore.collection('user').get()).docs;
  const userDocsMap: { [uid: string]: DocumentData } = {};
  userDocs.forEach((doc) => (userDocsMap[doc.id] = doc.data()));
  users.forEach((u) => {
    // u.authorized = userDocsMap[u.uid]?.authorized || false;
    Object.assign(u, userDocsMap[u.uid]);
  });
  return users;
};

export interface UsersResponse {
  users: UserRecordExtended[];
}

export async function GET(req: NextRequest) {
  try {
    await adminRequired(req);
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err: any) {
    if (isDynamicServerError(err)) {
      throw err;
    }
    console.error(`/api/users failed: ${err}\n${err.stack}`);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
