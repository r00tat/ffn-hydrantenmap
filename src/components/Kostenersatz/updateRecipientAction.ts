'use server';
import 'server-only';

import { actionUserAuthorizedForFirecall } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzRecipient,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';

export async function updateRecipientAction(
  firecallId: string,
  calculationId: string,
  recipient: KostenersatzRecipient
): Promise<{ success: boolean; error?: string }> {
  if (!firecallId || !calculationId) {
    return { success: false, error: 'Missing firecallId or calculationId' };
  }

  await actionUserAuthorizedForFirecall(firecallId);

  try {
    const calculationRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    // Only pick allowed fields to prevent injection of unexpected properties
    const sanitizedRecipient: KostenersatzRecipient = {
      name: recipient.name,
      address: recipient.address,
      phone: recipient.phone,
      email: recipient.email,
      paymentMethod: recipient.paymentMethod,
    };

    await calculationRef.update({
      recipient: sanitizedRecipient,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating recipient:', error);
    return { success: false, error: error.message };
  }
}
