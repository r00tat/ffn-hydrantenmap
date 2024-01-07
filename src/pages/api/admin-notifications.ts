import { getMessaging } from 'firebase-admin/messaging';
import type { NextApiRequest, NextApiResponse } from 'next';
import adminRequired from '../../server/auth/adminRequired';

export interface NotificationsBody {
  tokens: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (!(await adminRequired(req, res))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (req.method !== 'POST') {
      return res.status(400).json({ error: 'only POST allowed' });
    }

    const { tokens }: NotificationsBody = req.body;
    const messaging = getMessaging();
    messaging.subscribeToTopic(tokens, 'admin');
    res.status(200).json({ status: 'OK' });
  } catch (err: any) {
    console.error(`/api/users failed: ${err}\n${err.stack}`);
    res.status(500).json({ error: err.message });
  }
}
