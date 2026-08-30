'use server';
import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import { gmail } from '@googleapis/gmail';
import { actionUserAuthorizedForFirecall } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import {
  requireStammdatenForFirecall,
  StammdatenUnvollstaendigError,
} from '../../server/groups/requireStammdaten';
import { loadStammdatenLogo } from '../../server/groups/stammdatenStore';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import { buildMailMessage } from '../../server/mail/buildMailMessage';
import KostenersatzPdf from './KostenersatzPdf';
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import {
  FIRECALL_COLLECTION_ID,
  GROUP_COLLECTION_ID,
  Firecall,
} from '../firebase/firestore';
import { getDefaultRatesWithVersion } from '../../common/defaultKostenersatzRates';
import {
  SendEmailRequest,
  SendEmailResponse,
  KOSTENERSATZ_CONFIG_COLLECTION,
  KOSTENERSATZ_EMAIL_CONFIG_DOC,
  KostenersatzEmailConfig,
  DEFAULT_EMAIL_CONFIG,
} from '../../common/kostenersatzEmail';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

/**
 * Server action to send Kostenersatz email with PDF attachment
 */
export async function sendKostenersatzEmailAction(
  request: SendEmailRequest
): Promise<SendEmailResponse> {
  const { firecallId, calculationId, to, cc, subject, body: emailBody } = request;

  // Validate required fields
  if (!firecallId || !calculationId) {
    return { success: false, error: 'Missing firecallId or calculationId' };
  }

  if (!to) {
    return { success: false, error: 'Missing recipient email address' };
  }

  if (!subject || !emailBody) {
    return { success: false, error: 'Missing subject or body' };
  }

  // Check authentication and authorization for this firecall
  const firecall = await actionUserAuthorizedForFirecall(firecallId, {
    requireWrite: true,
  });

  // Validate Gmail API is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    return {
      success: false,
      error: 'Email service not configured',
      details: 'Google service account or impersonation account not set',
    };
  }

  try {
    // Ohne Absender und Bankverbindung entsteht kein Beleg, sondern ein
    // Zettel — und der hinge dann als PDF an einer Mail.
    const { stammdaten, feuerwehrName } = await requireStammdatenForFirecall(firecall);
    const logo = await loadStammdatenLogo(stammdaten);

    // Mailvorlage der Gruppe. `firecall.group` ist hier gesetzt, weil
    // `requireStammdatenForFirecall` sonst geworfen hätte.
    let emailConfig: KostenersatzEmailConfig = DEFAULT_EMAIL_CONFIG;
    const configDoc = await firestore
      .collection(GROUP_COLLECTION_ID)
      .doc(firecall.group!)
      .collection(KOSTENERSATZ_CONFIG_COLLECTION)
      .doc(KOSTENERSATZ_EMAIL_CONFIG_DOC)
      .get();

    if (configDoc.exists) {
      emailConfig = { ...DEFAULT_EMAIL_CONFIG, ...configDoc.data() };
    }

    // Load calculation
    const calculationRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    const calculationDoc = await calculationRef.get();

    if (!calculationDoc.exists) {
      return { success: false, error: 'Calculation not found' };
    }

    const calculation = {
      id: calculationDoc.id,
      ...calculationDoc.data(),
    } as KostenersatzCalculation;

    // A calculation stays editable (draft) until the invoice is actually sent or it
    // is completed manually. Sending the invoice is therefore allowed from any status
    // and is the action that closes the calculation (see status update below).

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
      KostenersatzPdf({
        calculation,
        rates,
        firecall,
        stammdaten,
        feuerwehrName,
        logo,
      })
    );

    // Create filename for attachment
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Build RFC 2822 email message
    // From is the impersonation account (actual sender), Reply-To is the configured fromEmail
    const impersonationAccount = process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT!;
    const rawMessage = buildMailMessage({
      to,
      from: impersonationAccount,
      replyTo: emailConfig.fromEmail,
      cc: cc && cc.length > 0 ? cc : undefined,
      subject,
      body: emailBody,
      attachments: [
        {
          content: pdfBuffer,
          filename,
          mimeType: 'application/pdf',
        },
      ],
    });

    // Encode message as base64url (Gmail API requirement)
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Initialize Gmail API with workspace auth
    const auth = createWorkspaceAuth(GMAIL_SCOPES);
    const gmailClient = gmail({ version: 'v1', auth });

    // Send email via Gmail API
    await gmailClient.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // Update calculation status: sending the invoice closes the calculation.
    const emailSentAt = new Date().toISOString();
    await calculationRef.update({
      status: 'completed',
      emailSentAt,
      updatedAt: emailSentAt,
    });

    return {
      success: true,
      emailSentAt,
    };
  } catch (error: any) {
    if (error instanceof StammdatenUnvollstaendigError) {
      return { success: false, error: 'stammdatenUnvollstaendig' };
    }
    console.error('Error sending email:', error);

    // Handle Gmail API errors
    if (error.errors && Array.isArray(error.errors)) {
      const gmailErrors = error.errors;
      return {
        success: false,
        error: 'Failed to send email',
        details: gmailErrors.map((e: any) => e.message).join(', '),
      };
    }

    // Handle Google API GaxiosError
    if (error.response?.data?.error) {
      return {
        success: false,
        error: 'Failed to send email',
        details: error.response.data.error.message || error.message,
      };
    }

    return {
      success: false,
      error: 'Failed to send email',
      details: error.message,
    };
  }
}
