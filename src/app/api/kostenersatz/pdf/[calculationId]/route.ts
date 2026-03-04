import { NextRequest, NextResponse } from 'next/server';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { firestore } from '../../../../../server/firebase/admin';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../../../../common/kostenersatz';
import { FIRECALL_COLLECTION_ID, Firecall } from '../../../../../components/firebase/firestore';
import {
  loadRatesForVersion,
  generatePdfBuffer,
} from '../../../../../components/Kostenersatz/completePaymentAndNotify';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ calculationId: string }> }
) {
  try {
    const { calculationId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const firecallId = searchParams.get('firecallId');

    if (!firecallId || !calculationId || !token) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Load calculation
    const calculationDoc = await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId)
      .get();

    if (!calculationDoc.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const calculation = {
      id: calculationDoc.id,
      ...calculationDoc.data(),
    } as KostenersatzCalculation;

    // Verify token
    if (!calculation.sumupRedirectToken || calculation.sumupRedirectToken !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Load firecall
    const firecallDoc = await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .get();

    if (!firecallDoc.exists) {
      return NextResponse.json({ error: 'Firecall not found' }, { status: 404 });
    }

    const firecall = { id: firecallDoc.id, ...firecallDoc.data() } as Firecall;

    // Load rates and generate PDF
    const rates = await loadRatesForVersion(calculation.rateVersion);
    const pdfBuffer = await generatePdfBuffer(calculation, rates, firecall);

    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const uint8Array = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    if (isDynamicServerError(error)) {
      throw error;
    }
    console.error('Error generating public PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
