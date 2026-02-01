import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import sgMail from '@sendgrid/mail';
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
import {
  SendEmailRequest,
  SendEmailResponse,
  KOSTENERSATZ_CONFIG_COLLECTION,
  KOSTENERSATZ_EMAIL_CONFIG_DOC,
  KostenersatzEmailConfig,
  DEFAULT_EMAIL_CONFIG,
} from '../../../../common/kostenersatzEmail';

// Initialize SendGrid with API key
const sendgridApiKey = process.env.SENDGRID_API_KEY;
if (sendgridApiKey) {
  sgMail.setApiKey(sendgridApiKey);
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    await userRequired(request);

    // Validate SendGrid is configured
    if (!sendgridApiKey) {
      return NextResponse.json(
        { error: 'Email service not configured', details: 'SENDGRID_API_KEY is not set' },
        { status: 500 }
      );
    }

    // Parse request body
    const body: SendEmailRequest = await request.json();
    const { firecallId, calculationId, to, cc, subject, body: emailBody } = body;

    // Validate required fields
    if (!firecallId || !calculationId) {
      return NextResponse.json(
        { error: 'Missing firecallId or calculationId' },
        { status: 400 }
      );
    }

    if (!to) {
      return NextResponse.json(
        { error: 'Missing recipient email address' },
        { status: 400 }
      );
    }

    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: 'Missing subject or body' },
        { status: 400 }
      );
    }

    // Load email config for the from address
    let emailConfig: KostenersatzEmailConfig = DEFAULT_EMAIL_CONFIG;
    const configDoc = await firestore
      .collection(KOSTENERSATZ_CONFIG_COLLECTION)
      .doc(KOSTENERSATZ_EMAIL_CONFIG_DOC)
      .get();

    if (configDoc.exists) {
      emailConfig = configDoc.data() as KostenersatzEmailConfig;
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
    const calculationRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    const calculationDoc = await calculationRef.get();

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

    // Check calculation status - only allow sending for completed or sent
    if (calculation.status === 'draft') {
      return NextResponse.json(
        { error: 'Cannot send email for draft calculations. Please complete the calculation first.' },
        { status: 400 }
      );
    }

    // Load rates for the calculation's version
    let rates: KostenersatzRate[] = [];
    const ratesSnapshot = await firestore
      .collection(KOSTENERSATZ_RATES_COLLECTION)
      .where('version', '==', calculation.rateVersion)
      .get();

    if (ratesSnapshot.empty) {
      rates = getDefaultRatesWithVersion();
    } else {
      rates = ratesSnapshot.docs.map((doc) => ({
        id: doc.data().id,
        ...doc.data(),
      })) as KostenersatzRate[];
      rates.sort((a, b) => a.sortOrder - b.sortOrder);
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

    // Create filename for attachment
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Build email message
    const msg: sgMail.MailDataRequired = {
      to,
      from: emailConfig.fromEmail,
      cc: cc && cc.length > 0 ? cc : undefined,
      subject,
      text: emailBody,
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    };

    // Send email
    await sgMail.send(msg);

    // Update calculation status
    const emailSentAt = new Date().toISOString();
    await calculationRef.update({
      status: 'sent',
      emailSentAt,
      updatedAt: emailSentAt,
    });

    const response: SendEmailResponse = {
      success: true,
      emailSentAt,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    if (isDynamicServerError(error)) {
      throw error;
    }

    console.error('Error sending email:', error);

    // Handle SendGrid-specific errors
    if (error.response?.body?.errors) {
      const sgErrors = error.response.body.errors;
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send email',
          details: sgErrors.map((e: any) => e.message).join(', '),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        details: error.message,
      },
      { status: error.status || 500 }
    );
  }
}
