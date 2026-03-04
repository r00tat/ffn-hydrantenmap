import { NextResponse } from 'next/server';
import { firestore } from '../../../../server/firebase/admin';
import { KOSTENERSATZ_SUBCOLLECTION } from '../../../../common/kostenersatz';
import { completePaymentAndNotify } from '../../../../components/Kostenersatz/completePaymentAndNotify';

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
