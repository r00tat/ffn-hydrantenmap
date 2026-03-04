'use server';
import 'server-only';

import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import { completePaymentAndNotify } from './completePaymentAndNotify';

export interface PaymentVerificationResult {
  success: boolean;
  error?: string;
  amount?: number;
  reference?: string;
  recipientName?: string;
  firecallId?: string;
  calculationId?: string;
  alreadyCompleted?: boolean;
}

export async function verifyPaymentAndComplete(
  firecallId: string,
  calculationId: string,
  token: string
): Promise<PaymentVerificationResult> {
  if (!firecallId || !calculationId || !token) {
    return { success: false, error: 'Ungültige Parameter' };
  }

  try {
    // Load calculation
    const calculationRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    const calculationDoc = await calculationRef.get();
    if (!calculationDoc.exists) {
      return { success: false, error: 'Berechnung nicht gefunden' };
    }

    const calculation = {
      id: calculationDoc.id,
      ...calculationDoc.data(),
    } as KostenersatzCalculation;

    // Verify token
    if (!calculation.sumupRedirectToken || calculation.sumupRedirectToken !== token) {
      return { success: false, error: 'Ungültiger Zugangstoken' };
    }

    // Verify payment with SumUp API
    if (!calculation.sumupCheckoutId) {
      return { success: false, error: 'Keine Zahlung gefunden' };
    }

    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Zahlungssystem nicht konfiguriert' };
    }

    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${calculation.sumupCheckoutId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!checkoutResponse.ok) {
      return { success: false, error: 'Zahlungsstatus konnte nicht geprüft werden' };
    }

    const checkout = await checkoutResponse.json();
    const sumupStatus = checkout.status?.toUpperCase();

    if (sumupStatus !== 'PAID') {
      return {
        success: false,
        error: sumupStatus === 'PENDING'
          ? 'Zahlung wird noch verarbeitet. Bitte versuchen Sie es in Kürze erneut.'
          : 'Zahlung war nicht erfolgreich',
      };
    }

    // Update payment status if not yet updated (webhook may not have fired yet)
    if (calculation.sumupPaymentStatus !== 'paid') {
      const updateData: Record<string, any> = {
        sumupPaymentStatus: 'paid',
        sumupPaidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (checkout.transactions?.[0]?.transaction_code) {
        updateData.sumupTransactionCode = checkout.transactions[0].transaction_code;
      }
      await calculationRef.update(updateData);
    }

    // Auto-close and send email (idempotent — safe if webhook already did it)
    const alreadyCompleted = calculation.status === 'completed' || calculation.status === 'sent';
    if (!alreadyCompleted) {
      try {
        await completePaymentAndNotify(firecallId, calculationId);
      } catch (error) {
        console.error('verifyPaymentAndComplete: completePaymentAndNotify failed:', error);
      }
    }

    return {
      success: true,
      amount: calculation.totalSum,
      reference: calculation.sumupCheckoutRef || calculationId,
      recipientName: calculation.recipient.name,
      firecallId,
      calculationId,
      alreadyCompleted,
    };
  } catch (error) {
    console.error('verifyPaymentAndComplete error:', error);
    return { success: false, error: 'Ein Fehler ist aufgetreten' };
  }
}
