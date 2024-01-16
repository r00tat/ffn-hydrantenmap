// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { DecodedIdToken } from 'firebase-admin/lib/auth/token-verifier';
import { DataMessagePayload } from 'firebase-admin/messaging';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ChatMessage } from '../../common/chat';
import userRequired from '../../server/auth/userRequired';
import firebaseAdmin, { firestore } from '../../server/firebase/admin';

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
    .collection('call')
    .doc(firecallId)
    .collection('chat');

  const newDoc = await chatCollection.add(newMessage);

  newMessage.id = newDoc.id;

  const messaging = firebaseAdmin.messaging();
  const resp = await messaging.sendToTopic('chat', {
    data: newMessage as unknown as DataMessagePayload,
  });
  console.info(`posted message to topic chat: ${resp.messageId}`);

  return { ...newMessage, id: newDoc.id };
}

export async function POST(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
  const authData = await userRequired(req, res);
  if (!authData) {
    return;
  }

  const { message, firecallId }: MessageBody = req.body;

  if (!message || !firecallId) {
    return res.status(400).json({
      error: 'message is required',
    });
  }

  try {
    const result = await newChatMessage(authData, firecallId, message);

    res.status(200).json(result);
  } catch (err) {
    console.error(`failed to save chat message ${err}`, err);
    res.status(500).json({ error: `failed to save chat message ${err}` });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UsersResponse>
) {
  switch (req.method) {
    case 'POST':
      return POST(req, res);
    default:
      console.info(`method not found`);
      return res.status(404).json({
        error: 'method not found',
      });
  }
}
