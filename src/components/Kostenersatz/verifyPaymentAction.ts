'use server';
import 'server-only';

import crypto from 'node:crypto';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import { completePaymentAndNotify } from './completePaymentAndNotify';

/**
 * Timing-safe comparison for redirect tokens to prevent timing side-channel attacks.
 */
function timingSafeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

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

/**
 * Verifies a SumUp payment callback and marks the calculation as completed.
 *
 * SECURITY: This server action intentionally does NOT use actionUserRequired().
 * It is called from the SumUp payment redirect page, where the visitor is the
 * external payment recipient (Kostenersatz debtor), NOT a logged-in fire department
 * member. These external users have no account in our system and no NextAuth session.
 *
 * Authentication relies on the sumupRedirectToken — a crypto.randomUUID() generated
 * per checkout (see sumupActions.ts). The token is stored in Firestore and embedded
 * in the redirect URL sent to the payer. Only someone who received the payment link
 * (via email) or completed the SumUp checkout flow possesses this token.
 *
 * The token comparison uses crypto.timingSafeEqual to prevent timing side-channel attacks.
 */
export async function verifyPaymentAndComplete(
  firecallId: string,
  calculationId: string,
  token: string,
  smpStatus?: string,
  smpTxCode?: string,
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

    // Verify token (timing-safe to prevent side-channel attacks)
    if (
      !calculation.sumupRedirectToken ||
      !timingSafeTokenEqual(calculation.sumupRedirectToken, token)
    ) {
      return { success: false, error: 'Ungültiger Zugangstoken' };
    }

    // Verify payment: hosted checkout (has sumupCheckoutId) or deep link (has smpStatus)
    if (calculation.sumupCheckoutId) {
      // Hosted checkout flow: verify via SumUp API
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
      const checkoutStatus = checkout.status?.toUpperCase();

      if (checkoutStatus !== 'PAID') {
        return {
          success: false,
          error: checkoutStatus === 'PENDING'
            ? 'Zahlung wird noch verarbeitet. Bitte versuchen Sie es in Kürze erneut.'
            : 'Zahlung war nicht erfolgreich',
        };
      }

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
    } else if (smpStatus) {
      // Deep link flow: SumUp app returned via callback with smp-status
      if (smpStatus !== 'success') {
        return { success: false, error: 'Zahlung war nicht erfolgreich' };
      }

      if (calculation.sumupPaymentStatus !== 'paid') {
        const updateData: Record<string, any> = {
          sumupPaymentStatus: 'paid',
          sumupPaidAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (smpTxCode) {
          updateData.sumupTransactionCode = smpTxCode;
        }
        await calculationRef.update(updateData);
      }
    } else {
      return { success: false, error: 'Keine Zahlung gefunden' };
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
