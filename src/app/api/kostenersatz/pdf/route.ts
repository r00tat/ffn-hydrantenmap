import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import userRequired from '../../../../server/auth/userRequired';
import { firestore } from '../../../../server/firebase/admin';
import KostenersatzPdfDocument from '../../../../components/Kostenersatz/KostenersatzPdfDocument';
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../../../common/kostenersatz';
import { FIRECALL_COLLECTION_ID, Firecall } from '../../../../components/firebase/firestore';
import { getDefaultRatesWithVersion } from '../../../../common/defaultKostenersatzRates';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    await userRequired(request);

    // Get parameters from URL
    const { searchParams } = new URL(request.url);
    const firecallId = searchParams.get('firecallId');
    const calculationId = searchParams.get('calculationId');

    if (!firecallId || !calculationId) {
      return NextResponse.json(
        { error: 'Missing firecallId or calculationId' },
        { status: 400 }
      );
    }

    // Load firecall
    const firecallDoc = await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .get();

    if (!firecallDoc.exists) {
      return NextResponse.json(
        { error: 'Firecall not found' },
        { status: 404 }
      );
    }

    const firecall = { id: firecallDoc.id, ...firecallDoc.data() } as Firecall;

    // Load calculation
    const calculationDoc = await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId)
      .get();

    if (!calculationDoc.exists) {
      return NextResponse.json(
        { error: 'Calculation not found' },
        { status: 404 }
      );
    }

    const calculation = {
      id: calculationDoc.id,
      ...calculationDoc.data(),
    } as KostenersatzCalculation;

    // Load rates for the calculation's version
    let rates: KostenersatzRate[] = [];
    const ratesSnapshot = await firestore
      .collection(KOSTENERSATZ_RATES_COLLECTION)
      .where('version', '==', calculation.rateVersion)
      .orderBy('sortOrder', 'asc')
      .get();

    if (ratesSnapshot.empty) {
      // Use default rates if none found
      rates = getDefaultRatesWithVersion();
    } else {
      rates = ratesSnapshot.docs.map((doc) => ({
        id: doc.data().id,
        ...doc.data(),
      })) as KostenersatzRate[];
    }

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      KostenersatzPdfDocument({
        calculation,
        rates,
        firecallName: firecall.name,
        firecallDate: firecall.date,
        firecallDescription: firecall.description,
      })
    );

    // Return PDF as response
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Convert Buffer to Uint8Array for NextResponse
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
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: error.status || 500 }
    );
  }
}
