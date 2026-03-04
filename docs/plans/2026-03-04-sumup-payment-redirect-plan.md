# SumUp Payment Redirect & Auto-Close Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a public payment confirmation page for SumUp online payments, auto-close calculations when paid, and keep recipient details editable after closing.

**Architecture:** One-time token stored on the calculation doc authorizes the public redirect page. A shared `completePaymentAndNotify` server function (extracted from email action) is called by the webhook, poll action, and redirect page to idempotently close and email. Recipient contact fields are decoupled from the `isEditable` flag.

**Tech Stack:** Next.js App Router (server components), Firebase Admin SDK, SumUp API, Gmail API, @react-pdf/renderer

---

### Task 1: Add `sumupRedirectToken` to Data Model

**Files:**
- Modify: `src/common/kostenersatz.ts:134-139`

**Step 1: Add the field to the type**

In `src/common/kostenersatz.ts`, add `sumupRedirectToken` to `KostenersatzCalculation` after the existing SumUp fields:

```typescript
  // SumUp payment tracking
  sumupCheckoutId?: string;
  sumupCheckoutRef?: string;
  sumupPaymentStatus?: 'pending' | 'paid' | 'failed' | 'expired';
  sumupPaidAt?: string;
  sumupTransactionCode?: string;
  sumupRedirectToken?: string;
```

**Step 2: Commit**

```bash
git add src/common/kostenersatz.ts
git commit -m "feat: add sumupRedirectToken to KostenersatzCalculation type"
```

---

### Task 2: Generate Token at Checkout Creation

**Files:**
- Modify: `src/components/Kostenersatz/sumupActions.ts:93-176`

**Step 1: Import crypto and generate token**

In `createSumupCheckout`, after line 118 (`const checkoutReference = ...`), add:

```typescript
    const { randomUUID } = await import('crypto');
    const redirectToken = randomUUID();
```

**Step 2: Update redirect_url to point to new public page with token**

Change line 133 from:
```typescript
        redirect_url: `${baseUrl}/einsatz/${firecallId}/kostenersatz/${calculationId}`,
```
to:
```typescript
        redirect_url: `${baseUrl}/einsatz/${firecallId}/kostenersatz/${calculationId}/payment?token=${redirectToken}`,
```

**Step 3: Store token in Firestore update**

In the `calculationRef.update()` call (line 158-163), add `sumupRedirectToken`:

```typescript
    await calculationRef.update({
      sumupCheckoutId: checkoutData.id,
      sumupCheckoutRef: checkoutReference,
      sumupPaymentStatus: 'pending',
      sumupRedirectToken: redirectToken,
      updatedAt: new Date().toISOString(),
    });
```

**Step 4: Commit**

```bash
git add src/components/Kostenersatz/sumupActions.ts
git commit -m "feat: generate redirect token at SumUp checkout creation"
```

---

### Task 3: Extract Shared `completePaymentAndNotify` Function

**Files:**
- Create: `src/components/Kostenersatz/completePaymentAndNotify.ts`
- Modify: `src/components/Kostenersatz/kostenersatzEmailAction.ts`

**Step 1: Create the shared helper**

Create `src/components/Kostenersatz/completePaymentAndNotify.ts`. This extracts the core PDF generation + Gmail send logic from `kostenersatzEmailAction.ts` into a reusable function. The function is NOT a server action (no `'use server'` directive) — it's a plain async function called from server contexts.

```typescript
import 'server-only';

import path from 'path';
import { renderToBuffer } from '@react-pdf/renderer';
import { google } from 'googleapis';
import { firestore } from '../../server/firebase/admin';
import { createWorkspaceAuth } from '../../server/auth/workspace';
import KostenersatzPdf from './KostenersatzPdf';
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import { FIRECALL_COLLECTION_ID, Firecall } from '../firebase/firestore';
import { getDefaultRatesWithVersion } from '../../common/defaultKostenersatzRates';
import {
  KOSTENERSATZ_CONFIG_COLLECTION,
  KOSTENERSATZ_EMAIL_CONFIG_DOC,
  KostenersatzEmailConfig,
  DEFAULT_EMAIL_CONFIG,
  renderEmailTemplates,
} from '../../common/kostenersatzEmail';

const logoPath = path.join(process.cwd(), 'public', 'FFND_logo.png');
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

/**
 * Build an RFC 2822 formatted email message with attachment.
 * Extracted from kostenersatzEmailAction.ts for reuse.
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

  return [headers, '', textPart, attachmentPart, `--${boundary}--`].join('\r\n');
}

/**
 * Load rates for a given version from Firestore.
 */
export async function loadRatesForVersion(rateVersion: string): Promise<KostenersatzRate[]> {
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

/**
 * Load email config from Firestore, falling back to defaults.
 */
export async function loadEmailConfig(): Promise<KostenersatzEmailConfig> {
  const configDoc = await firestore
    .collection(KOSTENERSATZ_CONFIG_COLLECTION)
    .doc(KOSTENERSATZ_EMAIL_CONFIG_DOC)
    .get();

  return configDoc.exists
    ? (configDoc.data() as KostenersatzEmailConfig)
    : DEFAULT_EMAIL_CONFIG;
}

/**
 * Generate PDF buffer for a calculation.
 */
export async function generatePdfBuffer(
  calculation: KostenersatzCalculation,
  rates: KostenersatzRate[],
  firecall: Firecall
): Promise<Buffer> {
  return await renderToBuffer(
    KostenersatzPdf({ calculation, rates, firecall, logoPath })
  );
}

/**
 * Send an email with PDF attachment via Gmail API.
 */
async function sendEmailWithPdf(params: {
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  filename: string;
  emailConfig: KostenersatzEmailConfig;
}): Promise<void> {
  const impersonationAccount = process.env.EINSATZMAPPE_IMPERSONATION_ACCOUNT;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT || !impersonationAccount) {
    throw new Error('Email service not configured');
  }

  const rawMessage = buildEmailMessage(
    params.to,
    impersonationAccount,
    params.emailConfig.fromEmail,
    params.cc && params.cc.length > 0 ? params.cc : undefined,
    params.subject,
    params.body,
    { content: params.pdfBuffer, filename: params.filename, mimeType: 'application/pdf' }
  );

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const auth = createWorkspaceAuth(GMAIL_SCOPES);
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}

/**
 * Idempotently complete a paid calculation: set status to completed,
 * generate PDF, send email, set status to sent.
 *
 * Called by: webhook, poll action, redirect page.
 * Skips if calculation is already completed or sent.
 *
 * Returns true if it processed (closed + emailed), false if skipped.
 */
export async function completePaymentAndNotify(
  firecallId: string,
  calculationId: string
): Promise<boolean> {
  const calculationRef = firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(KOSTENERSATZ_SUBCOLLECTION)
    .doc(calculationId);

  const calculationDoc = await calculationRef.get();
  if (!calculationDoc.exists) {
    console.error(`completePaymentAndNotify: calculation ${calculationId} not found`);
    return false;
  }

  const calculation = {
    id: calculationDoc.id,
    ...calculationDoc.data(),
  } as KostenersatzCalculation;

  // Idempotency: skip if already completed or sent
  if (calculation.status === 'completed' || calculation.status === 'sent') {
    console.info(`completePaymentAndNotify: calculation ${calculationId} already ${calculation.status}, skipping`);
    return false;
  }

  // First: close the calculation
  await calculationRef.update({
    status: 'completed',
    updatedAt: new Date().toISOString(),
  });

  // Load firecall for PDF and email template
  const firecallDoc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .get();

  if (!firecallDoc.exists) {
    console.error(`completePaymentAndNotify: firecall ${firecallId} not found`);
    return false;
  }

  const firecall = { id: firecallDoc.id, ...firecallDoc.data() } as Firecall;

  // Load email config and rates
  const emailConfig = await loadEmailConfig();
  const rates = await loadRatesForVersion(calculation.rateVersion);

  // Determine email recipient
  const recipientEmail = calculation.recipient.email || '';
  const ccEmail = emailConfig.ccEmail;
  const toAddress = recipientEmail || ccEmail;

  if (!toAddress) {
    console.warn(`completePaymentAndNotify: no email address available for calculation ${calculationId}`);
    return true; // still return true since we closed the calculation
  }

  try {
    // Render email templates
    const { subject, body } = renderEmailTemplates(
      emailConfig,
      calculation,
      firecall
    );

    // Generate PDF
    const pdfBuffer = await generatePdfBuffer(calculation, rates, firecall);
    const filename = `Kostenersatz_${firecall.name.replace(/[^a-zA-Z0-9]/g, '_')}_${calculation.recipient.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Build CC list: if sending to recipient, CC the config address; if sending to CC directly, no CC
    const ccList = recipientEmail && ccEmail && recipientEmail !== ccEmail ? [ccEmail] : [];

    await sendEmailWithPdf({
      to: toAddress,
      cc: ccList,
      subject,
      body,
      pdfBuffer,
      filename,
      emailConfig,
    });

    // Update status to sent
    const emailSentAt = new Date().toISOString();
    await calculationRef.update({
      status: 'sent',
      emailSentAt,
      updatedAt: emailSentAt,
    });

    console.info(`completePaymentAndNotify: calculation ${calculationId} completed and email sent`);
    return true;
  } catch (error) {
    console.error(`completePaymentAndNotify: email failed for calculation ${calculationId}:`, error);
    // Calculation is still 'completed' even if email fails — this is intentional
    return true;
  }
}
```

**Step 2: Refactor `kostenersatzEmailAction.ts` to reuse shared helpers**

Replace the duplicated logic in `sendKostenersatzEmailAction` with imports from the shared module. The server action keeps its auth guard and the interactive email flow (custom subject/body from user), but uses `loadEmailConfig`, `loadRatesForVersion`, `generatePdfBuffer` for the shared parts. Keep the existing `buildEmailMessage` function inline since the server action uses different email construction (user-provided subject/body vs template-rendered).

Actually, to minimize changes: keep `kostenersatzEmailAction.ts` as-is for now. The interactive email path is different enough (user edits subject/body in dialog) that extracting more would over-engineer. The `buildEmailMessage` function is duplicated but stable and small.

**Step 3: Commit**

```bash
git add src/components/Kostenersatz/completePaymentAndNotify.ts
git commit -m "feat: add completePaymentAndNotify shared helper for auto-close and email"
```

---

### Task 4: Enhance Webhook to Auto-Close on Payment

**Files:**
- Modify: `src/app/api/sumup/webhook/route.ts`

**Step 1: Import and call `completePaymentAndNotify`**

After the existing Firestore update (line 90 `await calcDoc.ref.update(updateData)`), add a call to auto-close when paid:

```typescript
import { completePaymentAndNotify } from '../../../../components/Kostenersatz/completePaymentAndNotify';
```

After the `await calcDoc.ref.update(updateData);` line, inside the `if (paymentStatus === 'paid')` block scope, add:

```typescript
      if (paymentStatus === 'paid') {
        // Extract firecallId from the document path: call/{firecallId}/kostenersatz/{calcId}
        const firecallId = calcDoc.ref.parent.parent?.id;
        if (firecallId) {
          try {
            await completePaymentAndNotify(firecallId, calcDoc.id);
          } catch (error) {
            console.error('SumUp webhook: completePaymentAndNotify failed:', error);
          }
        }
      }
```

This should go right after the existing `await calcDoc.ref.update(updateData);` on line 90, but wrap the whole thing so the auto-complete call is only made when status is `paid`.

**Step 2: Commit**

```bash
git add src/app/api/sumup/webhook/route.ts
git commit -m "feat: webhook auto-closes calculation and sends email on payment"
```

---

### Task 5: Enhance Poll Action to Auto-Close on Payment

**Files:**
- Modify: `src/components/Kostenersatz/sumupActions.ts:233-311`

**Step 1: Import completePaymentAndNotify**

Add at the top of `sumupActions.ts`:

```typescript
import { completePaymentAndNotify } from './completePaymentAndNotify';
```

**Step 2: Call after status update in `checkSumupPaymentStatus`**

After the Firestore update block (after `await calculationRef.update(updateData);` around line 303), add:

```typescript
      // Auto-close and send email when payment detected
      if (paymentStatus === 'paid') {
        try {
          await completePaymentAndNotify(firecallId, calculationId);
        } catch (error) {
          console.error('checkSumupPaymentStatus: completePaymentAndNotify failed:', error);
        }
      }
```

Also add the same check for when the status hasn't changed but is already `paid` (the calculation might not have been closed yet due to a prior failure). After the existing `if (calculation.sumupPaymentStatus !== paymentStatus)` block, add an else branch:

```typescript
    } else if (paymentStatus === 'paid' && calculation.status === 'draft') {
      // Status unchanged but calculation still draft — retry auto-close
      try {
        await completePaymentAndNotify(firecallId, calculationId);
      } catch (error) {
        console.error('checkSumupPaymentStatus: completePaymentAndNotify retry failed:', error);
      }
    }
```

**Step 3: Update return type to include `autoCompleted`**

Update `SumupPaymentStatusResponse`:

```typescript
interface SumupPaymentStatusResponse {
  success: boolean;
  status?: 'pending' | 'paid' | 'failed' | 'expired';
  autoCompleted?: boolean;
  error?: string;
}
```

Return `autoCompleted: true` when `completePaymentAndNotify` ran.

**Step 4: Commit**

```bash
git add src/components/Kostenersatz/sumupActions.ts
git commit -m "feat: poll action auto-closes calculation when payment detected"
```

---

### Task 6: Create Public Payment Redirect Page

**Files:**
- Create: `src/app/einsatz/[firecallId]/kostenersatz/[calculationId]/payment/page.tsx`
- Create: `src/app/einsatz/[firecallId]/kostenersatz/[calculationId]/payment/PaymentConfirmation.tsx`
- Create: `src/components/Kostenersatz/verifyPaymentAction.ts`

**Step 1: Create the server action for verification**

Create `src/components/Kostenersatz/verifyPaymentAction.ts`:

```typescript
'use server';
import 'server-only';

import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';
import { completePaymentAndNotify } from './completePaymentAndNotify';

export interface PaymentVerificationResult {
  success: boolean;
  error?: string;
  amount?: number;
  reference?: string;
  recipientName?: string;
  firecallId?: string;
  calculationId?: string;
  alreadyCompleted?: boolean;
}

/**
 * Verify a SumUp payment using the redirect token.
 * This is a PUBLIC action — no auth required, token is the authorization.
 */
export async function verifyPaymentAndComplete(
  firecallId: string,
  calculationId: string,
  token: string
): Promise<PaymentVerificationResult> {
  if (!firecallId || !calculationId || !token) {
    return { success: false, error: 'Ungültige Parameter' };
  }

  try {
    // Load calculation
    const calculationRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    const calculationDoc = await calculationRef.get();
    if (!calculationDoc.exists) {
      return { success: false, error: 'Berechnung nicht gefunden' };
    }

    const calculation = {
      id: calculationDoc.id,
      ...calculationDoc.data(),
    } as KostenersatzCalculation;

    // Verify token
    if (!calculation.sumupRedirectToken || calculation.sumupRedirectToken !== token) {
      return { success: false, error: 'Ungültiger Zugangstoken' };
    }

    // Verify payment with SumUp API
    if (!calculation.sumupCheckoutId) {
      return { success: false, error: 'Keine Zahlung gefunden' };
    }

    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'Zahlungssystem nicht konfiguriert' };
    }

    const checkoutResponse = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${calculation.sumupCheckoutId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!checkoutResponse.ok) {
      return { success: false, error: 'Zahlungsstatus konnte nicht geprüft werden' };
    }

    const checkout = await checkoutResponse.json();
    const sumupStatus = checkout.status?.toUpperCase();

    if (sumupStatus !== 'PAID') {
      return {
        success: false,
        error: sumupStatus === 'PENDING'
          ? 'Zahlung wird noch verarbeitet. Bitte versuchen Sie es in Kürze erneut.'
          : 'Zahlung war nicht erfolgreich',
      };
    }

    // Update payment status if not yet updated
    if (calculation.sumupPaymentStatus !== 'paid') {
      const updateData: Record<string, any> = {
        sumupPaymentStatus: 'paid',
        sumupPaidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (checkout.transactions?.[0]?.transaction_code) {
        updateData.sumupTransactionCode = checkout.transactions[0].transaction_code;
      }
      await calculationRef.update(updateData);
    }

    // Auto-close and send email (idempotent)
    const alreadyCompleted = calculation.status === 'completed' || calculation.status === 'sent';
    if (!alreadyCompleted) {
      try {
        await completePaymentAndNotify(firecallId, calculationId);
      } catch (error) {
        console.error('verifyPaymentAndComplete: completePaymentAndNotify failed:', error);
      }
    }

    return {
      success: true,
      amount: calculation.totalSum,
      reference: calculation.sumupCheckoutRef || calculationId,
      recipientName: calculation.recipient.name,
      firecallId,
      calculationId,
      alreadyCompleted,
    };
  } catch (error) {
    console.error('verifyPaymentAndComplete error:', error);
    return { success: false, error: 'Ein Fehler ist aufgetreten' };
  }
}
```

**Step 2: Create client component for the payment confirmation UI**

Create `src/app/einsatz/[firecallId]/kostenersatz/[calculationId]/payment/PaymentConfirmation.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { formatCurrency } from '../../../../../../common/kostenersatz';
import {
  verifyPaymentAndComplete,
  PaymentVerificationResult,
} from '../../../../../../components/Kostenersatz/verifyPaymentAction';

interface PaymentConfirmationProps {
  firecallId: string;
  calculationId: string;
  token: string;
}

export default function PaymentConfirmation({
  firecallId,
  calculationId,
  token,
}: PaymentConfirmationProps) {
  const [result, setResult] = useState<PaymentVerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verifyPaymentAndComplete(firecallId, calculationId, token)
      .then(setResult)
      .catch(() => setResult({ success: false, error: 'Ein Fehler ist aufgetreten' }))
      .finally(() => setLoading(false));
  }, [firecallId, calculationId, token]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={48} />
          <Typography variant="h6">Zahlung wird überprüft...</Typography>
        </Box>
      </Container>
    );
  }

  if (!result || !result.success) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Zahlungsbestätigung
          </Typography>
          <Alert severity="error" sx={{ mt: 2 }}>
            {result?.error || 'Ein Fehler ist aufgetreten'}
          </Alert>
        </Paper>
      </Container>
    );
  }

  const pdfUrl = `/api/kostenersatz/pdf/${calculationId}?token=${encodeURIComponent(token)}&firecallId=${encodeURIComponent(firecallId)}`;

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h4" gutterBottom>
          Zahlung erfolgreich
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Vielen Dank für Ihre Zahlung.
        </Typography>

        <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 3, mb: 3, textAlign: 'left' }}>
          {result.recipientName && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Name:</Typography>
              <Typography variant="body2" fontWeight="medium">{result.recipientName}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">Betrag:</Typography>
            <Typography variant="body2" fontWeight="medium">{formatCurrency(result.amount || 0)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">Referenz:</Typography>
            <Typography variant="body2" fontWeight="medium">{result.reference}</Typography>
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<PictureAsPdfIcon />}
          href={pdfUrl}
          target="_blank"
          fullWidth
        >
          Rechnung herunterladen (PDF)
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
          Freiwillige Feuerwehr Neusiedl am See
        </Typography>
      </Paper>
    </Container>
  );
}
```

**Step 3: Create the page (server component)**

Create `src/app/einsatz/[firecallId]/kostenersatz/[calculationId]/payment/page.tsx`:

```tsx
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ErrorIcon from '@mui/icons-material/Error';
import PaymentConfirmation from './PaymentConfirmation';

interface PaymentPageProps {
  params: Promise<{ firecallId: string; calculationId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function PaymentPage({ params, searchParams }: PaymentPageProps) {
  const { firecallId, calculationId } = await params;
  const { token } = await searchParams;

  if (!token) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Ungültiger Link
          </Typography>
          <Typography color="text.secondary">
            Dieser Zahlungslink ist ungültig. Bitte überprüfen Sie den Link.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <PaymentConfirmation
      firecallId={firecallId}
      calculationId={calculationId}
      token={token}
    />
  );
}
```

**Step 4: Commit**

```bash
git add src/components/Kostenersatz/verifyPaymentAction.ts src/app/einsatz/\[firecallId\]/kostenersatz/\[calculationId\]/payment/
git commit -m "feat: public payment redirect page with token verification"
```

---

### Task 7: Create Public PDF Download Endpoint

**Files:**
- Create: `src/app/api/kostenersatz/pdf/[calculationId]/route.ts`

**Step 1: Create the token-verified PDF endpoint**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/app/api/kostenersatz/pdf/\[calculationId\]/route.ts
git commit -m "feat: public token-verified PDF download endpoint"
```

---

### Task 8: Recipient Fields Always Editable + Save Button

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzEmpfaengerTab.tsx:187-226`
- Modify: `src/components/Kostenersatz/KostenersatzCalculationPage.tsx:465,592-601,635-678`
- Create: `src/components/Kostenersatz/updateRecipientAction.ts`

**Step 1: Create server action for updating recipient on closed calculations**

Create `src/components/Kostenersatz/updateRecipientAction.ts`:

```typescript
'use server';
import 'server-only';

import { actionUserAuthorizedForFirecall } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';
import {
  KostenersatzRecipient,
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../common/kostenersatz';

/**
 * Update only the recipient fields on a calculation.
 * Works on completed/sent calculations (unlike full save which is draft-only for amounts).
 */
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

    await calculationRef.update({
      recipient,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating recipient:', error);
    return { success: false, error: error.message };
  }
}
```

**Step 2: Remove `disabled` from contact fields in `KostenersatzEmpfaengerTab`**

In `KostenersatzEmpfaengerTab.tsx`, remove `disabled={disabled}` from the four contact TextFields (name, address, phone, email) at lines 193, 203, 213, 223. The `disabled` prop remains on the `FormControl` for payment method (line 228).

Before (each contact field):
```tsx
        disabled={disabled}
```

After: remove these four `disabled={disabled}` lines from the name, address, phone, and email TextFields. Keep the one on `<FormControl fullWidth disabled={disabled}>` for payment method.

**Step 3: Add "Empfänger speichern" button and resend email in `KostenersatzCalculationPage`**

In `KostenersatzCalculationPage.tsx`, in the action bar (around line 658), modify the `!isEditable` block to include a save recipient button:

Before:
```tsx
            {!isEditable && (
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopy}
                disabled={isSaving}
                size="small"
              >
                Kopieren
              </Button>
            )}
```

After:
```tsx
            {!isEditable && (
              <>
                <Button
                  variant="outlined"
                  onClick={handleSaveRecipient}
                  disabled={isSaving || !hasUnsavedChanges}
                  size="small"
                >
                  Empfänger speichern
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyIcon />}
                  onClick={handleCopy}
                  disabled={isSaving}
                  size="small"
                >
                  Kopieren
                </Button>
              </>
            )}
```

Add the `handleSaveRecipient` callback. Import `updateRecipientAction` and add:

```typescript
import { updateRecipientAction } from './updateRecipientAction';
```

```typescript
  const handleSaveRecipient = useCallback(async () => {
    const calcId = existingCalculation?.id || calculation.id;
    if (!calcId) return;
    setIsSaving(true);
    try {
      const result = await updateRecipientAction(firecallId, calcId, calculation.recipient);
      if (result.success) {
        setHasUnsavedChanges(false);
        setSuccessMessage('Empfänger gespeichert');
      }
    } catch (error) {
      console.error('Error saving recipient:', error);
    } finally {
      setIsSaving(false);
    }
  }, [existingCalculation?.id, calculation.id, calculation.recipient, firecallId]);
```

Also update the recipient change handler to set `hasUnsavedChanges` even when `!isEditable`:

The existing `handleRecipientChange` (around line 388-393) already calls `setHasUnsavedChanges(true)`, so this works. But check that recipient `onChange` is still called when `!isEditable`. Since we removed `disabled` from the contact fields, the `onChange` handler will fire correctly.

**Step 4: Commit**

```bash
git add src/components/Kostenersatz/updateRecipientAction.ts src/components/Kostenersatz/KostenersatzEmpfaengerTab.tsx src/components/Kostenersatz/KostenersatzCalculationPage.tsx
git commit -m "feat: recipient details always editable, save button for closed calculations"
```

---

### Task 9: Build Verification

**Step 1: Run lint**

```bash
npm run lint
```

**Step 2: Run build**

```bash
npm run build
```

**Step 3: Fix any errors, commit fixes**

---

### Task 10: Final Commit + Cleanup

**Step 1: Review all changes**

```bash
git diff main --stat
```

Verify no accidental changes or debug code.

**Step 2: Verify `next-env.d.ts` is clean (per CLAUDE.md)**

```bash
git checkout -- next-env.d.ts
```
