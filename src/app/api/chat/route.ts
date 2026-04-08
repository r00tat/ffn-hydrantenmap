import { DecodedIdToken } from 'firebase-admin/auth';
import { DataMessagePayload, getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { ChatMessage } from '../../../common/chat';
import userRequired from '../../../server/auth/userRequired';
import { firestore } from '../../../server/firebase/admin';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import {
  Firecall,
  FIRECALL_COLLECTION_ID,
  USER_COLLECTION_ID,
} from '../../../components/firebase/firestore';
import { FirebaseUserInfo } from '../../../common/users';
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
    data: newMessage as unknown as DataMessagePayload,
  });
  console.info(`posted message to topic chat: ${resp}`);

  return { ...newMessage, id: newDoc.id };
}

async function verifyUserAuthorizedForFirecall(
  user: DecodedIdToken,
  firecallId: string
): Promise<void> {
  const firecallDoc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();
  if (!firecallDoc.exists) {
    throw new ApiException(`firecall ${firecallId} does not exist`, {
      status: 404,
    });
  }
  const firecallData = firecallDoc.data() as Firecall;
  if (!firecallData || !firecallData.group) {
    throw new ApiException(`firecall ${firecallId} has no group`, {
      status: 403,
    });
  }

  const userDoc = await firestore
    .collection(USER_COLLECTION_ID)
    .doc(user.uid)
    .get();
  const userData = userDoc.data() as FirebaseUserInfo | undefined;
  const userGroups: string[] = userData?.groups || [];
  const userFirecall: string | undefined = userData?.firecall;

  if (
    !userGroups.includes(firecallData.group) &&
    userFirecall !== firecallId
  ) {
    throw new ApiException(
      `user ${user.uid} is not authorized for firecall ${firecallId}`,
      { status: 403 }
    );
  }
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
