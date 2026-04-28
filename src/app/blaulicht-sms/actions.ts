'use server';
import 'server-only';

import { actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { decryptPassword } from '../../server/blaulichtsms/encryption';

const COLLECTION = 'blaulichtsmsConfig';

export interface BlaulichtSmsAlarm {
  productType: string;
  customerId: string;
  customerName: string;
  alarmId: string;
  scenarioId: string | null;
  indexNumber: number;
  alarmGroups: {
    groupId: string;
    groupName: string;
  }[];
  alarmDate: string;
  endDate: string;
  authorName: string;
  alarmText: string;
  audioUrl: string | null;
  needsAcknowledgement: boolean;
  usersAlertedCount: number;
  geolocation: {
    coordinates: { lat: number; lon: number };
    positionSetByAuthor: boolean;
    radius: number | null;
    distance: number | null;
    duration: number | null;
    address: string | null;
  } | null;
  coordinates: { lat: number; lon: number } | null;
  recipients: {
    id: string;
    name: string;
    msisdn: string;
    comment: string;
    participation: 'yes' | 'no' | 'unknown' | 'pending';
    participationMessage: string | null;
    functions: {
      functionId: string;
      name: string;
      order: number;
      shortForm: string;
      backgroundHexColorCode: string;
      foregroundHexColorCode: string;
    }[];
  }[];
}

interface BlaulichtsmsCredentials {
  username: string;
  password: string;
  customerId: string;
}

async function loadCredentials(
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

export async function getBlaulichtSmsAlarms(
  groupId: string
): Promise<BlaulichtSmsAlarm[]> {
  const session = await actionUserRequired();

  const userGroups = session.user.groups ?? [];
  if (!session.user.isAdmin && !userGroups.includes(groupId)) {
    // User is not a member of this group — refuse to load alarms.
    // Return an empty list (instead of throwing) so the dialog stays usable.
    return [];
  }

  const creds = await loadCredentials(groupId);
  if (!creds) return [];

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
    console.error(
      'BlaulichtSMS dashboard login failed',
      loginResponse.status,
      loginResponse.statusText
    );
    return [];
  }

  const { sessionId } = await loginResponse.json();

  const dashboardResponse = await fetch(
    `https://api.blaulichtsms.net/blaulicht/api/alarm/v1/dashboard/${sessionId}`
  );

  if (!dashboardResponse.ok) {
    console.error(
      'Failed to fetch BlaulichtSMS dashboard data',
      dashboardResponse.status,
      dashboardResponse.statusText
    );
    return [];
  }

  return ((await dashboardResponse.json()).alarms ?? []) as BlaulichtSmsAlarm[];
}

export async function getBlaulichtSmsAlarmById(
  groupId: string,
  alarmId: string
): Promise<BlaulichtSmsAlarm | null> {
  await actionUserRequired();

  try {
    const alarms = await getBlaulichtSmsAlarms(groupId);
    if (alarms.length === 0) {
      console.warn(
        `BlaulichtSMS: No alarms returned for group "${groupId}" — credentials may be missing or API login failed`
      );
    }
    return alarms.find((a) => a.alarmId === alarmId) ?? null;
  } catch (err) {
    console.error(`BlaulichtSMS: Failed to fetch alarms for group "${groupId}":`, err);
    return null;
  }
}

export async function getFirecallsByAlarmIds(
  alarmIds: string[]
): Promise<Record<string, { id: string; name: string }>> {
  await actionUserRequired();

  if (alarmIds.length === 0) return {};

  const results: Record<string, { id: string; name: string }> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < alarmIds.length; i += 30) {
    chunks.push(alarmIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snapshot = await firestore
      .collection('call')
      .where('blaulichtSmsAlarmId', 'in', chunk)
      .where('deleted', '!=', true)
      .get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      results[data.blaulichtSmsAlarmId] = { id: doc.id, name: data.name };
    }
  }

  return results;
}
