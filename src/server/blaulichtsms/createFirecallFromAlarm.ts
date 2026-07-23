import 'server-only';

import { firestore } from '../firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../../components/firebase/firestore';
import {
  buildFirecallFromAlarm,
  DEFAULT_EINSATZ_FW,
} from '../../components/FirecallItems/einsatzDefaults';
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
    // Scope idempotency to the caller's group: never return (or leak) a
    // firecall that belongs to a different group, even if it links the same
    // alarm id. Group is filtered in JS (not the query) to avoid the Firestore
    // composite-index requirement of combining it with array-contains.
    if (data.deleted !== true && data.group === groupId) {
      return {
        id: doc.id,
        name: data.name,
        group: data.group,
        blaulichtSmsAlarmId: alarm.alarmId,
        created: false,
      };
    }
  }

  const now = new Date().toISOString();
  const firecallData = {
    ...buildFirecallFromAlarm(alarm),
    group: groupId,
    fw: DEFAULT_EINSATZ_FW,
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
