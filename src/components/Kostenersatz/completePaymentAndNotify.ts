import 'server-only';

import path from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { google } from 'googleapis';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID, Firecall } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import { getDefaultRatesWithVersion } from '../../common/defaultKostenersatzRates';
import {
  KOSTENERSATZ_CONFIG_COLLECTION,
  KOSTENERSATZ_EMAIL_CONFIG_DOC,
  KostenersatzEmailConfig,
  DEFAULT_EMAIL_CONFIG,
  buildTemplateContext,
  renderEmailTemplates,
} from '../../common/kostenersatzEmail';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import KostenersatzPdf from './KostenersatzPdf';

const logoPath = path.join(process.cwd(), 'public', 'FFND_logo.png');
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// ============================================================================
// Helper: Load rates for a specific version
// ============================================================================

/**
 * Load Kostenersatz rates for a given version from Firestore.
 * Falls back to default rates if no rates are found.
 */
export async function loadRatesForVersion(
  rateVersion: string
): Promise<KostenersatzRate[]> {
  const ratesSnapshot = await firestore
    .collection(KOSTENERSATZ_RATES_COLLECTION)
    .where('version', '==', rateVersion)
    .get();

  if (ratesSnapshot.empty) {
    return getDefaultRatesWithVersion();
  }

  const rates = ratesSnapshot.docs.map((doc) => ({
    id: doc.data().id,
    ...doc.data(),
  })) as KostenersatzRate[];

  rates.sort((a, b) => a.sortOrder - b.sortOrder);
  return rates;
}

// ============================================================================
// Helper: Load email configuration
// ============================================================================

/**
 * Load Kostenersatz email configuration from Firestore.
 * Falls back to DEFAULT_EMAIL_CONFIG if not found.
 */
export async function loadEmailConfig(): Promise<KostenersatzEmailConfig> {
  const configDoc = await firestore
    .collection(KOSTENERSATZ_CONFIG_COLLECTION)
    .doc(KOSTENERSATZ_EMAIL_CONFIG_DOC)
    .get();

  if (configDoc.exists) {
    return configDoc.data() as KostenersatzEmailConfig;
  }

  return DEFAULT_EMAIL_CONFIG;
}

// ============================================================================
// Helper: Generate PDF buffer
// ============================================================================

/**
 * Generate a PDF buffer for a Kostenersatz calculation.
 */
export async function generatePdfBuffer(
  calculation: KostenersatzCalculation,
  rates: KostenersatzRate[],
  firecall: Firecall
): Promise<Buffer> {
  const pdfBuffer = await renderToBuffer(
    KostenersatzPdf({
      calculation,
      rates,
      firecall,
      logoPath,
    })
  );
  return pdfBuffer;
}

// ============================================================================
// Helper: Build RFC 2822 email message with attachment
// ============================================================================

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

// ============================================================================
// Main: Complete payment and send notification email
// ============================================================================

/**
 * Idempotently close a paid Kostenersatz calculation and send an email notification.
 *
 * Called from: SumUp webhook, poll action, and redirect page.
 *
 * Returns `true` if the calculation was newly completed (or was already completed),
 * `false` if it was already in a terminal state (completed/sent) -- i.e. no work was done.
 */
export async function completePaymentAndNotify(
  firecallId: string,
  calculationId: string
): Promise<boolean> {
  // 1. Load calculation from Firestore
  const calculationRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(KOSTENERSATZ_SUBCOLLECTION)
    .doc(calculationId);

  const calculationDoc = await calculationRef.get();

  if (!calculationDoc.exists) {
    console.error(
      `[completePaymentAndNotify] Calculation ${calculationId} not found in firecall ${firecallId}`
    );
    return false;
  }

  const calculation = {
    id: calculationDoc.id,
    ...calculationDoc.data(),
  } as KostenersatzCalculation;

  // 2. Idempotency: if already completed or sent, nothing to do
  if (calculation.status === 'completed' || calculation.status === 'sent') {
    console.log(
      `[completePaymentAndNotify] Calculation ${calculationId} already has status '${calculation.status}', skipping`
    );
    return false;
  }

  // 3. Set status to 'completed'
  const now = new Date().toISOString();
  await calculationRef.update({
    status: 'completed',
    updatedAt: now,
  });
  calculation.status = 'completed';

  // 4. Load firecall, email config, and rates
  const firecallDoc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();

  if (!firecallDoc.exists) {
    console.error(
      `[completePaymentAndNotify] Firecall ${firecallId} not found`
    );
    return true; // Calculation was still closed
  }

  const firecall = {
    id: firecallDoc.id,
    ...firecallDoc.data(),
  } as Firecall;

  const [emailConfig, rates] = await Promise.all([
    loadEmailConfig(),
    loadRatesForVersion(calculation.rateVersion),
  ]);

  // 5. Determine email recipient
  const recipientEmail = calculation.recipient?.email;
  const ccEmail = emailConfig.ccEmail;

  let toAddress: string | undefined;
  let ccAddresses: string[] | undefined;

  if (recipientEmail) {
    toAddress = recipientEmail;
    if (ccEmail) {
      ccAddresses = [ccEmail];
    }
  } else if (ccEmail) {
    toAddress = ccEmail;
    ccAddresses = undefined;
  } else {
    console.warn(
      `[completePaymentAndNotify] No recipient email and no ccEmail configured for calculation ${calculationId}. Calculation closed without email.`
    );
    return true;
  }

  // 6. Check that email service is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    console.warn(
      `[completePaymentAndNotify] Email service not configured (missing GOOGLE_SERVICE_ACCOUNT or EINSATZMAPPE_IMPERSONATION_ACCOUNT). Calculation ${calculationId} closed without email.`
    );
    return true;
  }

  try {
    // 7. Render email subject and body using templates
    const templateContext = buildTemplateContext(calculation, firecall);
    const { subject, body } = renderEmailTemplates(emailConfig, templateContext);

    // 8. Generate PDF
    const pdfBuffer = await generatePdfBuffer(calculation, rates, firecall);

    // Create filename for attachment
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // 9. Build RFC 2822 email and send via Gmail API
    const impersonationAccount = process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT!;
    const rawMessage = buildEmailMessage(
      toAddress,
      impersonationAccount,
      emailConfig.fromEmail,
      ccAddresses,
      subject,
      body,
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

    // Send email
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // 10. Update status to 'sent' with timestamp
    const emailSentAt = new Date().toISOString();
    await calculationRef.update({
      status: 'sent',
      emailSentAt,
      updatedAt: emailSentAt,
    });

    console.log(
      `[completePaymentAndNotify] Email sent for calculation ${calculationId} to ${toAddress}`
    );
  } catch (error: any) {
    // 11. Email failure: log but don't throw. Calculation stays 'completed'.
    console.error(
      `[completePaymentAndNotify] Failed to send email for calculation ${calculationId}:`,
      error?.message || error
    );
  }

  return true;
}
