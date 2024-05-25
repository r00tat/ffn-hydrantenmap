import { getMessaging } from 'firebase-admin/messaging';
import type { NextApiRequest, NextApiResponse } from 'next';
import adminRequired from '../../../server/auth/adminRequired';
import { NextRequest, NextResponse } from 'next/server';
import { ApiException } from '../errors';

export interface NotificationsBody {
  tokens: string[];
}

export async function POST(req: NextRequest) {
  try {
    if (!(await adminRequired(req))) {
      throw new ApiException('Forbidden', { status: 403 });
    }

    const { tokens }: NotificationsBody = await req.json();
    const messaging = getMessaging();
    messaging.subscribeToTopic(tokens, 'admin');
    return NextResponse.json({ status: 'OK' });
  } catch (err: any) {
    console.error(`/api/users failed: ${err}\n${err.stack}`);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
