import 'server-only';

import { firestore } from '../firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../../components/firebase/firestore';
import { buildFirecallFromAlarm } from '../../components/FirecallItems/einsatzDefaults';
import type { BlaulichtSmsAlarm } from '../../common/blaulichtsms';

export interface CreateFirecallResult {
  id: string;
  name: string;
  group: string;
  blaulichtSmsAlarmId: string;
  created: boolean;
}

/**
 * Idempotently creates a Firecall from a BlaulichtSMS alarm. If a non-deleted
 * firecall is already linked to the alarm (via scalar `blaulichtSmsAlarmId` or
 * array `blaulichtSmsAlarmIds`), it is returned unchanged (`created: false`).
 * Otherwise a new firecall document is written via the Admin SDK.
 *
 * The `deleted` filter is applied in JS (not in the query) because a Firestore
 * `!=` filter would exclude documents missing the `deleted` field entirely.
 */
export async function createFirecallFromAlarm(
  alarm: BlaulichtSmsAlarm,
  groupId: string,
  owner: string,
): Promise<CreateFirecallResult> {
  const collection = firestore.collection(FIRECALL_COLLECTION_ID);

  const [scalarSnap, arraySnap] = await Promise.all([
    collection.where('blaulichtSmsAlarmId', '==', alarm.alarmId).get(),
    collection
      .where('blaulichtSmsAlarmIds', 'array-contains', alarm.alarmId)
      .get(),
  ]);

  const seen = new Set<string>();
  for (const doc of [...scalarSnap.docs, ...arraySnap.docs]) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    const data = doc.data();
    if (data.deleted !== true) {
      return {
        id: doc.id,
        name: data.name,
        group: data.group ?? groupId,
        blaulichtSmsAlarmId: alarm.alarmId,
        created: false,
      };
    }
  }

  const now = new Date().toISOString();
  const firecallData = {
    ...buildFirecallFromAlarm(alarm),
    group: groupId,
    deleted: false,
    user: owner,
    created: now,
    updatedAt: now,
    updatedBy: owner,
  };

  const newDoc = await collection.add(firecallData);
  return {
    id: newDoc.id,
    name: firecallData.name as string,
    group: groupId,
    blaulichtSmsAlarmId: alarm.alarmId,
    created: true,
  };
}
