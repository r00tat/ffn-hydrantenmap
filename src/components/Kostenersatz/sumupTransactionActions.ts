'use server';
import 'server-only';

import { auth } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
  KOSTENERSATZ_GROUP,
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

export async function fetchSumupTransactions(): Promise<SumUpTransactionRow[]> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }
  if (!session.user.groups?.includes(KOSTENERSATZ_GROUP)) {
    throw new Error('User is not in the kostenersatz group');
  }

  const snapshot = await firestore
    .collectionGroup(KOSTENERSATZ_SUBCOLLECTION)
    .where('sumupPaymentStatus', 'in', ['pending', 'paid', 'failed', 'expired'])
    .get();

  const rows: SumUpTransactionRow[] = [];
  const firecallCache = new Map<string, string>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as KostenersatzCalculation;
    const firecallId = doc.ref.parent.parent?.id || '';

    let firecallName = firecallCache.get(firecallId) || '';
    if (!firecallName && firecallId) {
      const firecallDoc = await firestore
        .collection(FIRECALL_COLLECTION_ID)
        .doc(firecallId)
        .get();
      firecallName = firecallDoc.data()?.name || firecallId;
      firecallCache.set(firecallId, firecallName);
    }

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
