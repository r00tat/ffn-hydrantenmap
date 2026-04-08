import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { firestore } from '../../../../server/firebase/admin';
import { KOSTENERSATZ_SUBCOLLECTION } from '../../../../common/kostenersatz';
import { completePaymentAndNotify } from '../../../../components/Kostenersatz/completePaymentAndNotify';

function verifySignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.SUMUP_WEBHOOK_SECRET;
    const signature = request.headers.get('X-Payload-Signature');

    if (webhookSecret) {
      if (!signature) {
        console.error(
          'SumUp webhook: missing X-Payload-Signature header'
        );
        return NextResponse.json(
          { error: 'Missing signature' },
          { status: 401 }
        );
      }
      if (!verifySignature(rawBody, signature, webhookSecret)) {
        console.error('SumUp webhook: invalid signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    } else {
      console.warn(
        'SumUp webhook: SUMUP_WEBHOOK_SECRET not configured, skipping signature verification'
      );
    }

    const body = JSON.parse(rawBody);
    const { id, event_type } = body;

    if (event_type !== 'CHECKOUT_STATUS_CHANGED' || !id || typeof id !== 'string' || id.length > 100) {
      return NextResponse.json({ received: true });
    }

    // Verify actual status by calling SumUp API
    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      console.error('SumUp webhook: API key not configured');
      return NextResponse.json({ received: true });
    }

    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${id}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!checkoutResponse.ok) {
      console.error(
        'SumUp webhook: failed to verify checkout',
        checkoutResponse.status
      );
      return NextResponse.json({ received: true });
    }

    const checkout = await checkoutResponse.json();
    const status = checkout.status?.toUpperCase();

    // Map SumUp status to our status
    let paymentStatus: 'pending' | 'paid' | 'failed' | 'expired';
    switch (status) {
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

    // Find the calculation by sumupCheckoutId across all firecalls
    const calcSnapshot = await firestore
      .collectionGroup(KOSTENERSATZ_SUBCOLLECTION)
      .where('sumupCheckoutId', '==', id)
      .limit(1)
      .get();

    if (!calcSnapshot.empty) {
      const calcDoc = calcSnapshot.docs[0];
      const existingData = calcDoc.data();

      // Skip if already in this status (idempotency)
      if (existingData.sumupPaymentStatus === paymentStatus) {
        console.info(
          `SumUp webhook: calculation ${calcDoc.id} already ${paymentStatus}, skipping`
        );
        return NextResponse.json({ received: true });
      }

      const updateData: Record<string, any> = {
        sumupPaymentStatus: paymentStatus,
        updatedAt: new Date().toISOString(),
      };

      if (paymentStatus === 'paid') {
        updateData.sumupPaidAt = new Date().toISOString();
        // Store transaction code if available
        if (checkout.transactions?.[0]?.transaction_code) {
          updateData.sumupTransactionCode =
            checkout.transactions[0].transaction_code;
        }
      }

      await calcDoc.ref.update(updateData);
      console.info(
        `SumUp webhook: updated calculation ${calcDoc.id} to ${paymentStatus}`
      );

      if (paymentStatus === 'paid') {
        const firecallId = calcDoc.ref.parent.parent?.id;
        if (firecallId) {
          try {
            await completePaymentAndNotify(firecallId, calcDoc.id);
          } catch (error) {
            console.error('SumUp webhook: completePaymentAndNotify failed:', error);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('SumUp webhook error:', error);
    // Still return 200 to prevent SumUp from retrying
    return NextResponse.json({ received: true });
  }
}
