import { DecodedIdToken } from 'firebase-admin/lib/auth/token-verifier';
import { DataMessagePayload } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '../../../common/chat';
import userRequired from '../../../server/auth/userRequired';
import firebaseAdmin, { firestore } from '../../../server/firebase/admin';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { FIRECALL_COLLECTION_ID } from '../../../components/firebase/firestore';

export interface UsersResponse {
  // user: UserRecordExtended;
}

export interface MessageBody {
  message: string;
  firecallId: string;
}

async function newChatMessage(
  user: DecodedIdToken,
  firecallId: string,
  message: string
): Promise<ChatMessage> {
  const newMessage: ChatMessage = {
    uid: user.uid,
    email: user.email,
    name: user.name,
    picture: user.picture,
    message,
    timestamp: new Date().toISOString(),
  };

  const chatCollection = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection('chat');

  const newDoc = await chatCollection.add(newMessage);

  newMessage.id = newDoc.id;

  const messaging = firebaseAdmin.messaging();
  const resp = await messaging.send({
    topic: 'chat',
    data: newMessage as unknown as DataMessagePayload,
  });
  console.info(`posted message to topic chat: ${resp}`);

  return { ...newMessage, id: newDoc.id };
}

export async function POST(req: NextRequest) {
  const authData = await userRequired(req);
  if (authData instanceof NextResponse) {
    return authData;
  }

  const { message, firecallId }: MessageBody = await req.json();

  if (!message || !firecallId) {
    return NextResponse.json(
      {
        error: 'message is required',
      },
      { status: 400 }
    );
  }

  try {
    const result = await newChatMessage(authData, firecallId, message);

    return NextResponse.json(result);
  } catch (err: any) {
    if (isDynamicServerError(err)) {
      throw err;
    }
    console.error(`failed to save chat message ${err}`, err);
    return NextResponse.json(
      { error: `failed to save chat message ${err}` },
      { status: err.status || 500 }
    );
  }
}
