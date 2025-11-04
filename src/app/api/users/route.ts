import { DocumentData } from 'firebase/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { UserRecordExtended } from '../../../common/users';
import adminRequired from '../../../server/auth/adminRequired';
import { firestore } from '../../../server/firebase/admin';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { listUsers } from './listUsers';

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
