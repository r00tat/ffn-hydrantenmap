'use server';
import 'server-only';

import { actionUserAuthorizedForFirecall, auth } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
  KOSTENERSATZ_SUMUP_CONFIG_DOC,
  KostenersatzSumupConfig,
  DEFAULT_SUMUP_CONFIG,
  KOSTENERSATZ_GROUP,
} from '../../common/kostenersatz';
import { KOSTENERSATZ_CONFIG_COLLECTION } from '../../common/kostenersatzEmail';

// ============================================================================
// Types
// ============================================================================

interface SumupCheckoutResponse {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

interface SumupDeepLinkResponse {
  success: boolean;
  deepLinkUrl?: string;
  error?: string;
}

interface SumupPaymentStatusResponse {
  success: boolean;
  status?: 'pending' | 'paid' | 'failed' | 'expired';
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check authentication, kostenersatz group membership, and firecall authorization.
 * Throws on failure; returns the session on success.
 */
async function requireKostenersatzUser(firecallId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }

  if (!session.user.groups?.includes(KOSTENERSATZ_GROUP)) {
    throw new Error('User is not in the kostenersatz group');
  }

  // Use existing pattern instead of reimplementing
  await actionUserAuthorizedForFirecall(firecallId);

  return session;
}

/**
 * Read SumUp configuration from Firestore.
 */
async function getSumupConfig(): Promise<KostenersatzSumupConfig> {
  const configDoc = await firestore
    .collection(KOSTENERSATZ_CONFIG_COLLECTION)
    .doc(KOSTENERSATZ_SUMUP_CONFIG_DOC)
    .get();

  if (configDoc.exists) {
    return configDoc.data() as KostenersatzSumupConfig;
  }

  return DEFAULT_SUMUP_CONFIG;
}

/**
 * Read a Kostenersatz calculation from Firestore.
 */
async function getCalculation(
  firecallId: string,
  calculationId: string
): Promise<KostenersatzCalculation> {
  const calculationDoc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(KOSTENERSATZ_SUBCOLLECTION)
    .doc(calculationId)
    .get();

  if (!calculationDoc.exists) {
    throw new Error('Calculation not found');
  }

  return {
    id: calculationDoc.id,
    ...calculationDoc.data(),
  } as KostenersatzCalculation;
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Create a SumUp hosted checkout for online payment.
 *
 * POSTs to the SumUp API to create a checkout, then updates the Firestore
 * calculation with the checkout details and sets payment status to 'pending'.
 */
export async function createSumupCheckout(
  firecallId: string,
  calculationId: string
): Promise<SumupCheckoutResponse> {
  try {
    await requireKostenersatzUser(firecallId);

    const [config, calculation] = await Promise.all([
      getSumupConfig(),
      getCalculation(firecallId, calculationId),
    ]);

    if (calculation.totalSum <= 0) {
      return { success: false, error: 'Calculation total must be greater than 0' };
    }

    if (!config.merchantCode) {
      return { success: false, error: 'SumUp merchant code not configured' };
    }

    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'SumUp API key not configured' };
    }

    const baseUrl =
      process.env.NEXTAUTH_URL || 'https://hydrant.ffnd.at';
    const checkoutReference = `KE-${firecallId}-${calculationId}-${Date.now()}`;

    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkout_reference: checkoutReference,
        amount: calculation.totalSum,
        currency: config.currency,
        merchant_code: config.merchantCode,
        description: `Kostenersatz ${firecallId}`,
        return_url: `${baseUrl}/api/sumup/webhook`,
        redirect_url: config.redirectUrl || `${baseUrl}/einsatz/${firecallId}/kostenersatz/${calculationId}`,
        hosted_checkout: {
          enabled: true,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('SumUp checkout creation failed:', response.status, errorBody);
      return {
        success: false,
        error: `SumUp API error: ${response.status}`,
      };
    }

    const checkoutData = await response.json();

    // Update Firestore calculation with checkout details
    const calculationRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    await calculationRef.update({
      sumupCheckoutId: checkoutData.id,
      sumupCheckoutRef: checkoutReference,
      sumupPaymentStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });

    const checkoutUrl = checkoutData.hosted_checkout_url;
    if (!checkoutUrl) {
      console.error('SumUp did not return hosted_checkout_url:', checkoutData);
      return { success: false, error: 'SumUp did not return a payment URL' };
    }

    return { success: true, checkoutUrl };
  } catch (error: any) {
    console.error('Error creating SumUp checkout:', error);
    return { success: false, error: 'Failed to create SumUp checkout' };
  }
}

/**
 * Generate a SumUp app deep link for card-present payment.
 *
 * Constructs a `sumupmerchant://` URL that opens the SumUp app
 * on a mobile device to process a card payment.
 */
export async function getSumupDeepLink(
  firecallId: string,
  calculationId: string
): Promise<SumupDeepLinkResponse> {
  try {
    await requireKostenersatzUser(firecallId);

    const [config, calculation] = await Promise.all([
      getSumupConfig(),
      getCalculation(firecallId, calculationId),
    ]);

    if (calculation.totalSum <= 0) {
      return { success: false, error: 'Calculation total must be greater than 0' };
    }

    if (!config.merchantCode) {
      return { success: false, error: 'SumUp merchant code not configured' };
    }

    const affiliateKey = process.env.SUMUP_AFFILIATE_KEY;
    if (!affiliateKey) {
      return { success: false, error: 'SumUp affiliate key not configured' };
    }

    const foreignTxId = `KE-${firecallId}-${calculationId}-${Date.now()}`;

    const params = new URLSearchParams({
      'affiliate-key': affiliateKey,
      total: calculation.totalSum.toFixed(2),
      currency: config.currency,
      title: `Kostenersatz ${firecallId}`,
      'foreign-tx-id': foreignTxId,
    });

    const deepLinkUrl = `sumupmerchant://pay/1.0?${params.toString()}`;

    return { success: true, deepLinkUrl };
  } catch (error: any) {
    console.error('Error generating SumUp deep link:', error);
    return { success: false, error: 'Failed to generate SumUp deep link' };
  }
}

/**
 * Check the current payment status of a SumUp checkout.
 *
 * Queries the SumUp API for the checkout status and updates Firestore
 * if the status has changed. This serves as a fallback when the webhook
 * is not reachable (e.g. local development) or fails.
 */
export async function checkSumupPaymentStatus(
  firecallId: string,
  calculationId: string
): Promise<SumupPaymentStatusResponse> {
  try {
    await requireKostenersatzUser(firecallId);

    const calculation = await getCalculation(firecallId, calculationId);

    if (!calculation.sumupCheckoutId) {
      return { success: false, error: 'Keine SumUp-Zahlung vorhanden' };
    }

    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'SumUp API key not configured' };
    }

    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${calculation.sumupCheckoutId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!checkoutResponse.ok) {
      return { success: false, error: 'Fehler beim Abrufen des Zahlungsstatus' };
    }

    const checkout = await checkoutResponse.json();
    const sumupStatus = checkout.status?.toUpperCase();

    let paymentStatus: 'pending' | 'paid' | 'failed' | 'expired';
    switch (sumupStatus) {
      case 'PAID':
        paymentStatus = 'paid';
        break;
      case 'FAILED':
        paymentStatus = 'failed';
        break;
      case 'EXPIRED':
        paymentStatus = 'expired';
        break;
      default:
        paymentStatus = 'pending';
    }

    // Update Firestore if status changed
    if (calculation.sumupPaymentStatus !== paymentStatus) {
      const calculationRef = firestore
        .collection(FIRECALL_COLLECTION_ID)
        .doc(firecallId)
        .collection(KOSTENERSATZ_SUBCOLLECTION)
        .doc(calculationId);

      const updateData: Record<string, any> = {
        sumupPaymentStatus: paymentStatus,
        updatedAt: new Date().toISOString(),
      };

      if (paymentStatus === 'paid') {
        updateData.sumupPaidAt = new Date().toISOString();
        if (checkout.transactions?.[0]?.transaction_code) {
          updateData.sumupTransactionCode =
            checkout.transactions[0].transaction_code;
        }
      }

      await calculationRef.update(updateData);
    }

    return { success: true, status: paymentStatus };
  } catch (error: any) {
    console.error('Error checking SumUp payment status:', error);
    return { success: false, error: 'Fehler beim Prüfen des Zahlungsstatus' };
  }
}
