import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import { gmail } from '@googleapis/gmail';
import { firestore } from '../../server/firebase/admin';
import {
  FIRECALL_COLLECTION_ID,
  GROUP_COLLECTION_ID,
  Firecall,
} from '../firebase/firestore';
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
import {
  requireStammdatenForFirecall,
  type StammdatenKontext,
} from '../../server/groups/requireStammdaten';
import { loadStammdatenLogo } from '../../server/groups/stammdatenStore';
import KostenersatzPdf from './KostenersatzPdf';

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
 * Mailvorlage der Gruppe, mit den Vorgaben als Rückfall.
 *
 * Je Gruppe, seit der Vorlagentext über `{{ absender.* }}` die Bankverbindung
 * nennt: Eine app-weite Vorlage trüge die IBAN einer fremden Feuerwehr.
 */
export async function loadEmailConfig(
  groupId: string
): Promise<KostenersatzEmailConfig> {
  const configDoc = await firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(KOSTENERSATZ_CONFIG_COLLECTION)
    .doc(KOSTENERSATZ_EMAIL_CONFIG_DOC)
    .get();

  if (configDoc.exists) {
    return { ...DEFAULT_EMAIL_CONFIG, ...configDoc.data() };
  }

  return DEFAULT_EMAIL_CONFIG;
}

// ============================================================================
// Helper: Generate PDF buffer
// ============================================================================

/**
 * Generate a PDF buffer for a Kostenersatz calculation.
 *
 * Wirft `StammdatenUnvollstaendigError`, wenn Absender oder Bankverbindung der
 * Gruppe fehlen: Ein Blatt ohne beides sieht aus wie ein Beleg und ist keiner.
 */
export async function generatePdfBuffer(
  calculation: KostenersatzCalculation,
  rates: KostenersatzRate[],
  firecall: Firecall
): Promise<Buffer> {
  const { stammdaten, feuerwehrName } = await requireStammdatenForFirecall(firecall);
  const logo = await loadStammdatenLogo(stammdaten);
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
 * Idempotently send the invoice email for a paid Kostenersatz calculation and,
 * once the email has actually gone out, close the calculation (status `completed`).
 *
 * Called from: SumUp webhook, poll action, and redirect page.
 *
 * The calculation is ONLY closed when the invoice email was sent successfully.
 * If no email can be sent (no recipient/cc address, email service not configured,
 * or the send fails), the calculation stays an editable draft and is NOT closed
 * automatically — a paid SumUp checkout alone never locks the calculation.
 *
 * Returns `true` if the invoice was sent and the calculation was closed,
 * `false` otherwise (already terminal, nothing sent, or send failed).
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

  // 3. Load firecall, email config, and rates (needed to decide whether an
  //    invoice email can be sent — the calculation is only closed if it can).
  const firecallDoc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();

  if (!firecallDoc.exists) {
    console.error(
      `[completePaymentAndNotify] Firecall ${firecallId} not found. Calculation ${calculationId} stays a draft.`
    );
    return false; // No email possible -> do not close.
  }

  const firecall = {
    id: firecallDoc.id,
    ...firecallDoc.data(),
  } as Firecall;

  // Ohne Absender und Bankverbindung entsteht kein Beleg. Der Zahlungseingang
  // ist davon unberührt — die Berechnung bleibt Entwurf und lässt sich
  // nachschicken, sobald die Stammdaten gepflegt sind.
  let kontext: StammdatenKontext;
  try {
    kontext = await requireStammdatenForFirecall(firecall);
  } catch (error) {
    console.warn(
      `[completePaymentAndNotify] Stammdaten der Gruppe fehlen für ${calculationId}; Berechnung bleibt Entwurf:`,
      error
    );
    return false; // No invoice possible -> do not close.
  }

  const [emailConfig, rates] = await Promise.all([
    loadEmailConfig(kontext.groupId),
    loadRatesForVersion(calculation.rateVersion),
  ]);

  // 4. Determine email recipient
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
      `[completePaymentAndNotify] No recipient email and no ccEmail configured for calculation ${calculationId}. Calculation stays an editable draft (not closed).`
    );
    return false; // No email possible -> do not close.
  }

  // 5. Check that email service is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT) {
    console.warn(
      `[completePaymentAndNotify] Email service not configured (missing GOOGLE_SERVICE_ACCOUNT or EINSATZMAPPE_IMPERSONATION_ACCOUNT). Calculation ${calculationId} stays an editable draft (not closed).`
    );
    return false; // No email possible -> do not close.
  }

  try {
    // 6. Render email subject and body using templates
    const templateContext = buildTemplateContext(
      calculation,
      firecall,
      kontext.stammdaten,
      kontext.feuerwehrName
    );
    const { subject, body } = renderEmailTemplates(emailConfig, templateContext);

    // 7. Generate PDF
    const pdfBuffer = await generatePdfBuffer(calculation, rates, firecall);

    // Create filename for attachment
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // 8. Build RFC 2822 email and send via Gmail API
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
    const gmailClient = gmail({ version: 'v1', auth });

    // Send email
    await gmailClient.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // 9. Email sent successfully -> close the calculation as 'completed'.
    const emailSentAt = new Date().toISOString();
    await calculationRef.update({
      status: 'completed',
      emailSentAt,
      updatedAt: emailSentAt,
    });

    console.log(
      `[completePaymentAndNotify] Email sent for calculation ${calculationId} to ${toAddress}; calculation closed.`
    );

    return true;
  } catch (error: any) {
    // 10. Email failure: log but don't throw. The calculation stays an editable
    //     draft (NOT closed) so it can be retried / sent manually.
    console.error(
      `[completePaymentAndNotify] Failed to send email for calculation ${calculationId}; calculation stays a draft:`,
      error?.message || error
    );
    return false;
  }
}
