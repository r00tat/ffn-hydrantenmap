import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import userRequired from '../../../../server/auth/userRequired';
import { verifyUserAuthorizedForFirecall } from '../../../../server/auth/verifyUserAuthorizedForFirecall';
import { firestore } from '../../../../server/firebase/admin';
import KostenersatzPdf from '../../../../components/Kostenersatz/KostenersatzPdf';
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../../../common/kostenersatz';
import { FIRECALL_COLLECTION_ID } from '../../../../components/firebase/firestore';
import { getDefaultRatesWithVersion } from '../../../../common/defaultKostenersatzRates';
import {
  requireStammdatenForFirecall,
  StammdatenUnvollstaendigError,
} from '../../../../server/groups/requireStammdaten';
import { loadStammdatenLogo } from '../../../../server/groups/stammdatenStore';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authData = await userRequired(request);

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

    // Verify the caller is authorized for this specific firecall (prevents
    // IDOR: the calculation contains the recipient's name, address and contact
    // details, which must not be readable across firecalls/groups).
    const firecall = await verifyUserAuthorizedForFirecall(
      authData,
      firecallId
    );

    // Ohne Absender und Bankverbindung entstünde ein Blatt, das aussieht wie
    // ein Beleg und keiner ist — der Fehler fiele erst beim
    // Zahlungspflichtigen auf.
    const { stammdaten, feuerwehrName } = await requireStammdatenForFirecall(firecall);
    const logo = await loadStammdatenLogo(stammdaten);

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
      .get();

    if (ratesSnapshot.empty) {
      // Use default rates if none found
      rates = getDefaultRatesWithVersion();
    } else {
      rates = ratesSnapshot.docs.map((doc) => ({
        id: doc.data().id,
        ...doc.data(),
      })) as KostenersatzRate[];
      // Sort by sortOrder client-side
      rates.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      KostenersatzPdf({
        calculation,
        rates,
        firecall,
        stammdaten,
        feuerwehrName,
        logo,
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
    // 409 und nicht 500: Der Server ist in Ordnung, es fehlen Stammdaten. Die
    // Oberfläche kann daraus einen Hinweis auf die Verwaltung machen.
    if (error instanceof StammdatenUnvollstaendigError) {
      return NextResponse.json(
        {
          error: 'stammdatenUnvollstaendig',
          luecken: error.luecken,
          groupId: error.groupId,
        },
        { status: 409 }
      );
    }
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error.message },
      { status: error.status || 500 }
    );
  }
}
