'use server';
import 'server-only';

import { actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { decryptPassword } from '../../server/blaulichtsms/encryption';
import { isAuthorizedForFirecall } from './groupFilter';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

export type { BlaulichtSmsAlarm };

const COLLECTION = 'blaulichtsmsConfig';

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
  const session = await actionUserRequired();

  if (alarmIds.length === 0) return {};

  const userGroups = session.user.groups ?? [];
  const userFirecall = session.user.firecall;
  const isAdmin = session.user.isAdmin;

  const results: Record<string, { id: string; name: string }> = {};
  // Firestore caps both `in` and `array-contains-any` at 30 values per query.
  const FIRESTORE_QUERY_LIMIT = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < alarmIds.length; i += FIRESTORE_QUERY_LIMIT) {
    chunks.push(alarmIds.slice(i, i + FIRESTORE_QUERY_LIMIT));
  }

  for (const chunk of chunks) {
    const [scalarSnap, arraySnap] = await Promise.all([
      firestore
        .collection('call')
        .where('blaulichtSmsAlarmId', 'in', chunk)
        .where('deleted', '!=', true)
        .get(),
      // Uses the composite index (call: blaulichtSmsAlarmIds ARRAY_CONTAINS, deleted)
      // defined in firebase/{dev,prod}/firestore.indexes.json.
      firestore
        .collection('call')
        .where('blaulichtSmsAlarmIds', 'array-contains-any', chunk)
        .where('deleted', '!=', true)
        .get(),
    ]);

    const seenDocIds = new Set<string>();
    for (const doc of [...scalarSnap.docs, ...arraySnap.docs]) {
      if (seenDocIds.has(doc.id)) continue;
      seenDocIds.add(doc.id);

      const data = doc.data();
      // Only expose firecalls the user is authorized for; otherwise this leaks
      // ids/names of firecalls from other groups.
      if (
        !isAuthorizedForFirecall(
          data.group,
          doc.id,
          userGroups,
          userFirecall,
          isAdmin
        )
      ) {
        continue;
      }

      // Map every alarm id of this firecall that was part of the request chunk
      // so both primary and Nachalarm ids get badged.
      const fcAlarmIds =
        (data.blaulichtSmsAlarmIds as string[] | undefined) ??
        (data.blaulichtSmsAlarmId ? [data.blaulichtSmsAlarmId] : []);
      for (const aid of fcAlarmIds) {
        if (chunk.includes(aid)) {
          results[aid] = { id: doc.id, name: data.name };
        }
      }
    }
  }

  return results;
}
