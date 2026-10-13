'use server';
import 'server-only';

import { ApiException } from '../../app/api/errors';
import { actionUserRequired } from '../../app/auth';
import { can, canAny } from '../../common/permissions';
import { firestore } from '../../server/firebase/admin';
import { Firecall, FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';

export interface SumUpTransactionRow {
  firecallId: string;
  firecallName: string;
  calculationId: string;
  recipientName: string;
  totalSum: number;
  sumupPaymentStatus: string;
  createdAt: string;
  sumupPaidAt?: string;
  sumupTransactionCode?: string;
  sumupCheckoutRef?: string;
}

/**
 * SumUp-Zahlungen aller Einsätze, deren Gruppe dem Benutzer Kostenersatz
 * erlaubt. Die Abfrage läuft über alle Einsätze (Collection Group); gefiltert
 * wird je Einsatz nach dessen Gruppe — wer Kostenersatz nur in einer Gruppe
 * macht, sieht die Zahlungen der anderen nicht.
 */
export async function fetchSumupTransactions(): Promise<SumUpTransactionRow[]> {
  const session = await actionUserRequired();
  if (!canAny(session.user, 'kostenersatz.use')) {
    throw new ApiException('user lacks kostenersatz.use', { status: 403 });
  }

  const snapshot = await firestore
    .collectionGroup(KOSTENERSATZ_SUBCOLLECTION)
    .where('sumupPaymentStatus', 'in', ['pending', 'paid', 'failed', 'expired'])
    .get();

  const rows: SumUpTransactionRow[] = [];
  const firecallCache = new Map<string, { name: string; permitted: boolean }>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as KostenersatzCalculation;
    const firecallId = doc.ref.parent.parent?.id || '';
    if (!firecallId) continue;

    let firecallInfo = firecallCache.get(firecallId);
    if (!firecallInfo) {
      const firecall = (
        await firestore.collection(FIRECALL_COLLECTION_ID).doc(firecallId).get()
      ).data() as Firecall | undefined;
      firecallInfo = {
        name: firecall?.name || firecallId,
        permitted:
          !!firecall?.group &&
          can(session.user, firecall.group, 'kostenersatz.use'),
      };
      firecallCache.set(firecallId, firecallInfo);
    }
    if (!firecallInfo.permitted) continue;
    const firecallName = firecallInfo.name;

    rows.push({
      firecallId,
      firecallName,
      calculationId: doc.id,
      recipientName: data.recipient?.name || '',
      totalSum: data.totalSum,
      sumupPaymentStatus: data.sumupPaymentStatus || 'pending',
      createdAt: data.createdAt,
      sumupPaidAt: data.sumupPaidAt,
      sumupTransactionCode: data.sumupTransactionCode,
      sumupCheckoutRef: data.sumupCheckoutRef,
    });
  }

  // Sort by creation date descending (client-side to avoid composite index)
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return rows;
}
