import 'server-only';

import { firestore } from '../firebase/admin';
import { decryptPassword } from './encryption';
import { ApiException } from '../../app/api/errors';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

const COLLECTION = 'blaulichtsmsConfig';

interface BlaulichtsmsCredentials {
  username: string;
  password: string;
  customerId: string;
}

export async function loadCredentials(
  groupId: string
): Promise<BlaulichtsmsCredentials | null> {
  // Try Firestore first
  const doc = await firestore.collection(COLLECTION).doc(groupId).get();
  if (doc.exists) {
    const data = doc.data()!;
    try {
      const password = await decryptPassword(data.passwordEncrypted);
      return { username: data.username, password, customerId: data.customerId };
    } catch (err) {
      console.error(
        `Failed to decrypt BlaulichtSMS password for group "${groupId}":`,
        err
      );
      return null;
    }
  }

  // Fall back to env vars for the legacy group
  const legacyGroup = process.env.BLAULICHTSMS_REQUIRED_GROUP ?? 'ffnd';
  if (groupId === legacyGroup) {
    const username = process.env.BLAULICHTSMS_USERNAME;
    const password = process.env.BLAULICHTSMS_PASSWORD;
    const customerId = process.env.BLAULICHTSMS_CUSTOMER_ID;
    if (username && password && customerId) {
      return { username, password, customerId };
    }
  }

  return null;
}

/**
 * Session-agnostic fetch of BlaulichtSMS alarms for a group. Unlike the
 * UI-facing server action, this THROWS on missing credentials / API errors so
 * callers (e.g. the API route) can map to proper HTTP status codes.
 */
export async function fetchBlaulichtSmsAlarms(
  groupId: string
): Promise<BlaulichtSmsAlarm[]> {
  const creds = await loadCredentials(groupId);
  if (!creds) {
    throw new ApiException(`BlaulichtSMS not configured for group ${groupId}`, {
      status: 404,
    });
  }

  const { username, password, customerId } = creds;

  const loginResponse = await fetch(
    'https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, customerId }),
    }
  );

  if (!loginResponse.ok) {
    throw new ApiException(
      `BlaulichtSMS dashboard login failed (${loginResponse.status})`,
      { status: 502 }
    );
  }

  const { sessionId } = await loginResponse.json();

  const dashboardResponse = await fetch(
    `https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/${sessionId}`
  );

  if (!dashboardResponse.ok) {
    throw new ApiException(
      `Failed to fetch BlaulichtSMS dashboard data (${dashboardResponse.status})`,
      { status: 502 }
    );
  }

  return ((await dashboardResponse.json()).alarms ?? []) as BlaulichtSmsAlarm[];
}

export async function fetchBlaulichtSmsAlarmById(
  groupId: string,
  alarmId: string
): Promise<BlaulichtSmsAlarm | null> {
  const alarms = await fetchBlaulichtSmsAlarms(groupId);
  return alarms.find((a) => a.alarmId === alarmId) ?? null;
}
