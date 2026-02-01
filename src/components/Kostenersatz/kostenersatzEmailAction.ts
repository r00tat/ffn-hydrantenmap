'use server';
import 'server-only';

import path from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { google } from 'googleapis';
import { actionUserAuthorizedForFirecall } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import KostenersatzPdf from './KostenersatzPdf';

const logoPath = path.join(process.cwd(), 'public', 'FFND_logo.png');
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import { FIRECALL_COLLECTION_ID, Firecall } from '../firebase/firestore';
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
 * Build an RFC 2822 formatted email message with attachment
 */
function buildEmailMessage(
  to: string,
  from: string,
  replyTo: string,
  cc: string[] | undefined,
  subject: string,
  body: string,
  attachment: { content: Buffer; filename: string; mimeType: string }
): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const headers = [
    `From: ${from}`,
    `Reply-To: ${replyTo}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join('\r\n');

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
  ].join('\r\n');

  const attachmentPart = [
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    '',
    attachment.content.toString('base64'),
  ].join('\r\n');

  const message = [headers, '', textPart, attachmentPart, `--${boundary}--`].join('\r\n');

  return message;
}

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
  const firecall = await actionUserAuthorizedForFirecall(firecallId);

  // Validate Gmail API is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    return {
      success: false,
      error: 'Email service not configured',
      details: 'Google service account or impersonation account not set',
    };
  }

  try {
    // Load email config for the from address
    let emailConfig: KostenersatzEmailConfig = DEFAULT_EMAIL_CONFIG;
    const configDoc = await firestore
      .collection(KOSTENERSATZ_CONFIG_COLLECTION)
      .doc(KOSTENERSATZ_EMAIL_CONFIG_DOC)
      .get();

    if (configDoc.exists) {
      emailConfig = configDoc.data() as KostenersatzEmailConfig;
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

    // Check calculation status - only allow sending for completed or sent
    if (calculation.status === 'draft') {
      return {
        success: false,
        error: 'Cannot send email for draft calculations. Please complete the calculation first.',
      };
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
      KostenersatzPdf({
        calculation,
        rates,
        firecall,
        logoPath,
      })
    );

    // Create filename for attachment
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Build RFC 2822 email message
    // From is the impersonation account (actual sender), Reply-To is the configured fromEmail
    const impersonationAccount = process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT!;
    const rawMessage = buildEmailMessage(
      to,
      impersonationAccount,
      emailConfig.fromEmail,
      cc && cc.length > 0 ? cc : undefined,
      subject,
      emailBody,
      {
        content: pdfBuffer,
        filename,
        mimeType: 'application/pdf',
      }
    );

    // Encode message as base64url (Gmail API requirement)
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Initialize Gmail API with workspace auth
    const auth = createWorkspaceAuth(GMAIL_SCOPES);
    const gmail = google.gmail({ version: 'v1', auth });

    // Send email via Gmail API
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // Update calculation status
    const emailSentAt = new Date().toISOString();
    await calculationRef.update({
      status: 'sent',
      emailSentAt,
      updatedAt: emailSentAt,
    });

    return {
      success: true,
      emailSentAt,
    };
  } catch (error: any) {
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
