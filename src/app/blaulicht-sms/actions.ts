'use server';
import 'server-only';

import { actionUserRequired } from '../auth';
import { firestore } from '../../server/firebase/admin';
import { fetchBlaulichtSmsAlarms } from '../../server/blaulichtsms/fetchAlarms';
import { ApiException } from '../api/errors';
import { isAuthorizedForFirecall } from './groupFilter';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

export type { BlaulichtSmsAlarm };

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

  try {
    return await fetchBlaulichtSmsAlarms(groupId);
  } catch (err) {
    // A 404 means the group simply has no BlaulichtSMS config — a normal,
    // expected state that was silent before. Only log unexpected failures.
    if (!(err instanceof ApiException && err.status === 404)) {
      console.error(
        `Failed to fetch BlaulichtSMS alarms for group "${groupId}":`,
        err
      );
    }
    return [];
  }
}

export async function getBlaulichtSmsAlarmById(
  groupId: string,
  alarmId: string
): Promise<BlaulichtSmsAlarm | null> {
  await actionUserRequired();
  try {
    const alarms = await getBlaulichtSmsAlarms(groupId);
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
