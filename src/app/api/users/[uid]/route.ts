import { NextRequest, NextResponse } from 'next/server';
import { UserRecordExtended } from '../../../../common/users';
import adminRequired from '../../../../server/auth/adminRequired';
import { updateUser } from './updateUser';

export interface UsersResponse {
  user: UserRecordExtended;
}

export async function POST(req: NextRequest, props: { params: Promise<{ uid: string }> }) {
  const params = await props.params;

  const {
    uid
  } = params;

  try {
    await adminRequired(req);
    const user: UserRecordExtended = await req.json();
    const result = await updateUser(uid, user);

    return NextResponse.json({ user: result });
  } catch (err: any) {
    console.error(`failed update user`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
