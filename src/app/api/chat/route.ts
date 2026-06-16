import { DecodedIdToken } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '../../../common/chat';
import userRequired from '../../../server/auth/userRequired';
import { verifyUserAuthorizedForFirecall } from '../../../server/auth/verifyUserAuthorizedForFirecall';
import { firestore } from '../../../server/firebase/admin';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { FIRECALL_COLLECTION_ID } from '../../../components/firebase/firestore';
import { ApiException } from '../errors';

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

  const messaging = getMessaging();
  const resp = await messaging.send({
    topic: 'chat',
    data: newMessage as unknown as { [key: string]: string },
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
    await verifyUserAuthorizedForFirecall(authData, firecallId);
    const result = await newChatMessage(authData, firecallId, message);

    return NextResponse.json(result);
  } catch (err: any) {
    if (isDynamicServerError(err)) {
      throw err;
    }
    if (err instanceof ApiException) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status || 403 }
      );
    }
    console.error(`failed to save chat message ${err}`, err);
    return NextResponse.json(
      { error: `failed to save chat message ${err}` },
      { status: err.status || 500 }
    );
  }
}
