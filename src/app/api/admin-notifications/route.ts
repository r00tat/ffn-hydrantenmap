import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import adminRequired from '../../../server/auth/adminRequired';

export interface NotificationsBody {
  tokens: string[];
}

export async function POST(req: NextRequest) {
  try {
    await adminRequired(req);

    const { tokens }: NotificationsBody = await req.json();
    const messaging = getMessaging();
    await messaging.subscribeToTopic(tokens, 'admin');
    return NextResponse.json({ status: 'OK' });
  } catch (err: any) {
    console.error(`/api/users failed: ${err}\n${err.stack}`);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
