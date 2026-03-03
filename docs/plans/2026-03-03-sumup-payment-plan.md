# SumUp Payment Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate SumUp online payment and deep link app payment into the Kostenersatz feature, with server-side secret management, webhook-based payment tracking, and pipeline updates.

**Architecture:** Server actions create SumUp checkouts or deep links, returning URLs to the frontend. A webhook API route receives payment status updates from SumUp and writes them to Firestore. Terraform manages GCP secrets; GitHub Actions deploys them to Cloud Run.

**Tech Stack:** Next.js 16 (App Router), React 19, MUI, Firebase/Firestore, SumUp Checkouts API v0.1, Terraform (Google provider v7), GitHub Actions

---

### Task 1: Extend Data Model Types

**Files:**
- Modify: `src/common/kostenersatz.ts:65` (PaymentMethod type)
- Modify: `src/common/kostenersatz.ts:92-128` (KostenersatzCalculation interface)
- Modify: `src/common/kostenersatz.ts:134-138` (collection constants)
- Modify: `src/common/kostenersatz.ts:390-398` (formatPaymentMethod)

**Step 1: Update PaymentMethod type**

In `src/common/kostenersatz.ts`, change line 65:

```typescript
// Before:
export type PaymentMethod = 'bar' | 'kreditkarte' | 'rechnung';

// After:
export type PaymentMethod = 'bar' | 'kreditkarte' | 'rechnung' | 'sumup_online' | 'sumup_app';
```

**Step 2: Add SumUp fields to KostenersatzCalculation**

After the `emailSentAt` field (line 127), add:

```typescript
  // SumUp payment tracking
  sumupCheckoutId?: string;
  sumupCheckoutRef?: string;
  sumupPaymentStatus?: 'pending' | 'paid' | 'failed' | 'expired';
  sumupPaidAt?: string;
  sumupTransactionCode?: string;
```

**Step 3: Add SumUp config constants**

After line 138 (`KOSTENERSATZ_VEHICLES_COLLECTION`), add:

```typescript
export const KOSTENERSATZ_SUMUP_CONFIG_DOC = 'sumupSettings';
```

**Step 4: Add SumUp config interface**

After the `KostenersatzVehicle` interface (after line 153), add:

```typescript
export interface KostenersatzSumupConfig {
  merchantCode: string;
  currency: string;
  redirectUrl?: string;
}

export const DEFAULT_SUMUP_CONFIG: KostenersatzSumupConfig = {
  merchantCode: '',
  currency: 'EUR',
};
```

**Step 5: Update formatPaymentMethod**

In `src/common/kostenersatz.ts`, update the `formatPaymentMethod` function (lines 390-398):

```typescript
export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'bar':
      return 'Bar: Betrag eingehoben';
    case 'kreditkarte':
      return 'Kreditkarte: Betrag eingehoben';
    case 'rechnung':
      return 'Rechnung: Betrag ausständig';
    case 'sumup_online':
      return 'Onlinezahlung (SumUp)';
    case 'sumup_app':
      return 'Kartenzahlung (SumUp)';
  }
}
```

**Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds (type changes may cause errors in components that exhaustively check PaymentMethod — fix those in the next task)

**Step 7: Commit**

```bash
git add src/common/kostenersatz.ts
git commit -m "feat: extend Kostenersatz data model with SumUp payment types"
```

---

### Task 2: Create SumUp Server Actions

**Files:**
- Create: `src/components/Kostenersatz/sumupActions.ts`

**Step 1: Create the server actions file**

Create `src/components/Kostenersatz/sumupActions.ts`:

```typescript
'use server';
import 'server-only';

import { actionUserAuthorizedForFirecall, auth } from '../../app/auth';
import { firestore } from '../../server/firebase/admin';
import {
  FIRECALL_COLLECTION_ID,
} from '../firebase/firestore';
import {
  KostenersatzCalculation,
  KOSTENERSATZ_SUBCOLLECTION,
  KOSTENERSATZ_SUMUP_CONFIG_DOC,
  KostenersatzSumupConfig,
  DEFAULT_SUMUP_CONFIG,
  KOSTENERSATZ_GROUP,
} from '../../common/kostenersatz';
import {
  KOSTENERSATZ_CONFIG_COLLECTION,
} from '../../common/kostenersatzEmail';

async function requireKostenersatzUser(firecallId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }
  if (!session.user.groups?.includes(KOSTENERSATZ_GROUP)) {
    throw new Error('User not in kostenersatz group');
  }
  await actionUserAuthorizedForFirecall(firecallId);
  return session;
}

async function getSumupConfig(): Promise<KostenersatzSumupConfig> {
  const doc = await firestore
    .collection(KOSTENERSATZ_CONFIG_COLLECTION)
    .doc(KOSTENERSATZ_SUMUP_CONFIG_DOC)
    .get();
  if (doc.exists) {
    return doc.data() as KostenersatzSumupConfig;
  }
  return DEFAULT_SUMUP_CONFIG;
}

async function getCalculation(firecallId: string, calculationId: string): Promise<KostenersatzCalculation> {
  const doc = await firestore
    .collection(FIRECALL_COLLECTION_ID)
    .doc(firecallId)
    .collection(KOSTENERSATZ_SUBCOLLECTION)
    .doc(calculationId)
    .get();
  if (!doc.exists) {
    throw new Error('Calculation not found');
  }
  return { id: doc.id, ...doc.data() } as KostenersatzCalculation;
}

export interface CreateCheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

export async function createSumupCheckout(
  firecallId: string,
  calculationId: string
): Promise<CreateCheckoutResult> {
  await requireKostenersatzUser(firecallId);

  const apiKey = process.env.SUMUP_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'SumUp API key not configured' };
  }

  const config = await getSumupConfig();
  if (!config.merchantCode) {
    return { success: false, error: 'SumUp merchant code not configured' };
  }

  const calculation = await getCalculation(firecallId, calculationId);
  if (calculation.totalSum <= 0) {
    return { success: false, error: 'Calculation total must be greater than 0' };
  }

  const checkoutRef = `KE-${firecallId}-${calculationId}-${Date.now()}`;

  // Determine webhook and redirect URLs
  const baseUrl = process.env.NEXTAUTH_URL || 'https://hydrant.ffnd.at';
  const returnUrl = `${baseUrl}/api/sumup/webhook`;
  const redirectUrl = config.redirectUrl || `${baseUrl}/einsatz/${firecallId}/kostenersatz/${calculationId}`;

  try {
    const response = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        merchant_code: config.merchantCode,
        amount: calculation.totalSum,
        currency: config.currency,
        checkout_reference: checkoutRef,
        description: `Kostenersatz ${calculationId}`,
        return_url: returnUrl,
        redirect_url: redirectUrl,
        hosted_checkout: { enabled: true },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('SumUp checkout creation failed:', response.status, errorData);
      return { success: false, error: `SumUp API error: ${response.status}` };
    }

    const data = await response.json();

    // Update calculation in Firestore
    const calcRef = firestore
      .collection(FIRECALL_COLLECTION_ID)
      .doc(firecallId)
      .collection(KOSTENERSATZ_SUBCOLLECTION)
      .doc(calculationId);

    await calcRef.update({
      sumupCheckoutId: data.id,
      sumupCheckoutRef: checkoutRef,
      sumupPaymentStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      checkoutUrl: data.hosted_checkout_url,
    };
  } catch (error: any) {
    console.error('Error creating SumUp checkout:', error);
    return { success: false, error: error.message };
  }
}

export interface DeepLinkResult {
  success: boolean;
  deepLinkUrl?: string;
  error?: string;
}

export async function getSumupDeepLink(
  firecallId: string,
  calculationId: string
): Promise<DeepLinkResult> {
  await requireKostenersatzUser(firecallId);

  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY;
  if (!affiliateKey) {
    return { success: false, error: 'SumUp affiliate key not configured' };
  }

  const config = await getSumupConfig();
  const calculation = await getCalculation(firecallId, calculationId);

  if (calculation.totalSum <= 0) {
    return { success: false, error: 'Calculation total must be greater than 0' };
  }

  const foreignTxId = `KE-${firecallId}-${calculationId}`;

  const params = new URLSearchParams({
    'affiliate-key': affiliateKey,
    'total': calculation.totalSum.toFixed(2),
    'currency': config.currency,
    'title': `Kostenersatz ${calculationId}`,
    'foreign-tx-id': foreignTxId,
  });

  const deepLinkUrl = `sumupmerchant://pay/1.0?${params.toString()}`;

  return {
    success: true,
    deepLinkUrl,
  };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Kostenersatz/sumupActions.ts
git commit -m "feat: add SumUp server actions for checkout and deep link"
```

---

### Task 3: Create Webhook API Route

**Files:**
- Create: `src/app/api/sumup/webhook/route.ts`

**Step 1: Create the webhook route**

Create `src/app/api/sumup/webhook/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { firestore } from '../../../../server/firebase/admin';
import {
  FIRECALL_COLLECTION_ID,
} from '../../../../components/firebase/firestore';
import {
  KOSTENERSATZ_SUBCOLLECTION,
} from '../../../../common/kostenersatz';

export async function POST(request: Request) {
  // Respond immediately as SumUp requires
  try {
    const body = await request.json();
    const { id, event_type } = body;

    if (event_type !== 'CHECKOUT_STATUS_CHANGED' || !id) {
      return NextResponse.json({ received: true });
    }

    // Verify actual status by calling SumUp API
    const apiKey = process.env.SUMUP_API_KEY;
    if (!apiKey) {
      console.error('SumUp webhook: API key not configured');
      return NextResponse.json({ received: true });
    }

    const checkoutResponse = await fetch(`https://api.sumup.com/v0.1/checkouts/${id}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!checkoutResponse.ok) {
      console.error('SumUp webhook: failed to verify checkout', checkoutResponse.status);
      return NextResponse.json({ received: true });
    }

    const checkout = await checkoutResponse.json();
    const status = checkout.status?.toUpperCase();

    // Map SumUp status to our status
    let paymentStatus: 'pending' | 'paid' | 'failed' | 'expired';
    switch (status) {
      case 'PAID':
        paymentStatus = 'paid';
        break;
      case 'FAILED':
        paymentStatus = 'failed';
        break;
      case 'EXPIRED':
        paymentStatus = 'expired';
        break;
      default:
        paymentStatus = 'pending';
    }

    // Find the calculation by sumupCheckoutId
    // We need to search across all firecalls
    const firecallsSnapshot = await firestore
      .collection(FIRECALL_COLLECTION_ID)
      .get();

    for (const firecallDoc of firecallsSnapshot.docs) {
      const calcSnapshot = await firecallDoc.ref
        .collection(KOSTENERSATZ_SUBCOLLECTION)
        .where('sumupCheckoutId', '==', id)
        .limit(1)
        .get();

      if (!calcSnapshot.empty) {
        const calcDoc = calcSnapshot.docs[0];
        const updateData: Record<string, any> = {
          sumupPaymentStatus: paymentStatus,
          updatedAt: new Date().toISOString(),
        };

        if (paymentStatus === 'paid') {
          updateData.sumupPaidAt = new Date().toISOString();
          // Store transaction code if available
          if (checkout.transactions?.[0]?.transaction_code) {
            updateData.sumupTransactionCode = checkout.transactions[0].transaction_code;
          }
        }

        await calcDoc.ref.update(updateData);
        console.info(`SumUp webhook: updated calculation ${calcDoc.id} to ${paymentStatus}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('SumUp webhook error:', error);
    // Still return 200 to prevent SumUp from retrying
    return NextResponse.json({ received: true });
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/sumup/webhook/route.ts
git commit -m "feat: add SumUp webhook API route for payment status updates"
```

---

### Task 4: Update Empfaenger Tab with SumUp Payment Buttons

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzEmpfaengerTab.tsx`

**Step 1: Update the component to include SumUp payment methods and action buttons**

Replace the entire file content. Key changes:
- Add `sumup_online` and `sumup_app` to the PAYMENT_METHODS array
- Add props for `firecallId`, `calculationId`, and `calculation` (for reading sumupPaymentStatus)
- Add "Online bezahlen" button that calls `createSumupCheckout` server action
- Add "In SumUp App bezahlen" button that calls `getSumupDeepLink` server action
- Show payment status chip when sumupPaymentStatus is set

The component needs new props:

```typescript
export interface KostenersatzEmpfaengerTabProps {
  recipient: KostenersatzRecipient;
  onChange: (recipient: KostenersatzRecipient) => void;
  disabled?: boolean;
  firecallId?: string;
  calculationId?: string;
  sumupPaymentStatus?: string;
}
```

Add imports for:
- `Button`, `Chip`, `CircularProgress`, `Alert` from MUI
- `useState` from React
- `createSumupCheckout`, `getSumupDeepLink` from `./sumupActions`
- `PaymentIcon` and `PhoneAndroidIcon` from MUI icons

After the payment method select, conditionally render:
- For `sumup_online`: a button "Online bezahlen" that calls `createSumupCheckout`, then opens the returned URL in a new tab via `window.open()`
- For `sumup_app`: a button "In SumUp App bezahlen" that calls `getSumupDeepLink`, then navigates to the deep link URL via `window.location.href`
- A `Chip` showing the current `sumupPaymentStatus` (color-coded: warning=pending, success=paid, error=failed/expired)

**Step 2: Update KostenersatzCalculationPage to pass new props**

In `src/components/Kostenersatz/KostenersatzCalculationPage.tsx`, update the `KostenersatzEmpfaengerTab` usage (around line 579) to pass the new props:

```tsx
<KostenersatzEmpfaengerTab
  recipient={calculation.recipient}
  onChange={handleRecipientChange}
  disabled={!isEditable}
  firecallId={firecallId}
  calculationId={existingCalculation?.id || calculation.id}
  sumupPaymentStatus={calculation.sumupPaymentStatus}
/>
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/Kostenersatz/KostenersatzEmpfaengerTab.tsx src/components/Kostenersatz/KostenersatzCalculationPage.tsx
git commit -m "feat: add SumUp payment buttons to Kostenersatz Empfaenger tab"
```

---

### Task 5: Update PDF Payment Method Display

**Files:**
- Modify: `src/components/Kostenersatz/KostenersatzPdf.tsx:266` (payment method display)

**Step 1: Verify the PDF renders correctly**

The PDF already uses `formatPaymentMethod(calculation.recipient.paymentMethod)` on line 266. Since we updated `formatPaymentMethod` in Task 1, the PDF will automatically show the correct text for `sumup_online` and `sumup_app`.

No code changes needed — just verify by checking that `KostenersatzPdf.tsx` line 266 calls `formatPaymentMethod`.

**Step 2: Commit (skip if no changes needed)**

No commit needed for this task.

---

### Task 6: Add SumUp Admin Settings

**Files:**
- Create: `src/hooks/useKostenersatzSumupConfig.ts`
- Modify: `src/components/Kostenersatz/KostenersatzAdminSettings.tsx`

**Step 1: Create the SumUp config hook**

Create `src/hooks/useKostenersatzSumupConfig.ts`, following the same pattern as `useKostenersatzEmailConfig.ts`:

```typescript
'use client';

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  KostenersatzSumupConfig,
  DEFAULT_SUMUP_CONFIG,
  KOSTENERSATZ_SUMUP_CONFIG_DOC,
} from '../common/kostenersatz';
import {
  KOSTENERSATZ_CONFIG_COLLECTION,
} from '../common/kostenersatzEmail';
import useFirebaseLogin from './useFirebaseLogin';

export function useKostenersatzSumupConfig() {
  const [config, setConfig] = useState<KostenersatzSumupConfig>(DEFAULT_SUMUP_CONFIG);
  const [loading, setLoading] = useState(true);
  const { email } = useFirebaseLogin();

  useEffect(() => {
    const docRef = doc(
      firestore,
      KOSTENERSATZ_CONFIG_COLLECTION,
      KOSTENERSATZ_SUMUP_CONFIG_DOC
    );

    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setConfig(docSnapshot.data() as KostenersatzSumupConfig);
        } else {
          setConfig(DEFAULT_SUMUP_CONFIG);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading SumUp config:', err);
        setConfig(DEFAULT_SUMUP_CONFIG);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const saveConfig = useCallback(
    async (newConfig: Partial<KostenersatzSumupConfig>) => {
      const docRef = doc(
        firestore,
        KOSTENERSATZ_CONFIG_COLLECTION,
        KOSTENERSATZ_SUMUP_CONFIG_DOC
      );

      const updatedConfig: KostenersatzSumupConfig = {
        ...config,
        ...newConfig,
      };

      await setDoc(docRef, updatedConfig);
    },
    [config]
  );

  return { config, loading, saveConfig };
}
```

**Step 2: Add SumUp tab to admin settings**

In `src/components/Kostenersatz/KostenersatzAdminSettings.tsx`:

1. Import the new hook: `import { useKostenersatzSumupConfig } from '../../hooks/useKostenersatzSumupConfig';`

2. Add state and hook usage inside the component (after the email config hook, around line 65):
```typescript
const { config: sumupConfig, loading: sumupConfigLoading, saveConfig: saveSumupConfig } = useKostenersatzSumupConfig();
const [merchantCodeEdit, setMerchantCodeEdit] = useState('');
const [currencyEdit, setCurrencyEdit] = useState('EUR');
const [savingSumupConfig, setSavingSumupConfig] = useState(false);
const [sumupConfigSaved, setSumupConfigSaved] = useState(false);
```

3. Add useEffect to initialize from config (after the email config useEffect):
```typescript
useEffect(() => {
  if (!sumupConfigLoading && sumupConfig) {
    setMerchantCodeEdit(sumupConfig.merchantCode);
    setCurrencyEdit(sumupConfig.currency);
  }
}, [sumupConfig, sumupConfigLoading]);
```

4. Add a save handler:
```typescript
const handleSaveSumupConfig = async () => {
  setSavingSumupConfig(true);
  try {
    await saveSumupConfig({
      merchantCode: merchantCodeEdit,
      currency: currencyEdit,
    });
    setSumupConfigSaved(true);
    setTimeout(() => setSumupConfigSaved(false), 3000);
  } catch (error) {
    console.error('Error saving SumUp config:', error);
  } finally {
    setSavingSumupConfig(false);
  }
};
```

5. Add "SumUp" tab to the Tabs component (after "E-Mail" tab, line 339):
```tsx
<Tab label="SumUp" />
```

6. Add the SumUp settings panel (after the E-Mail tab panel, before the seed dialog):
```tsx
{activeTab === 4 && (
  <Card>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        SumUp Einstellungen
      </Typography>
      {sumupConfigLoading ? (
        <CircularProgress size={20} />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sumupConfigSaved && (
            <Alert severity="success">SumUp-Einstellungen gespeichert!</Alert>
          )}
          <TextField
            label="Merchant Code"
            value={merchantCodeEdit}
            onChange={(e) => setMerchantCodeEdit(e.target.value)}
            fullWidth
            size="small"
            helperText="SumUp Merchant Code (z.B. ME7RMQN3)"
          />
          <TextField
            label="Währung"
            value={currencyEdit}
            onChange={(e) => setCurrencyEdit(e.target.value)}
            fullWidth
            size="small"
            helperText="ISO 4217 Währungscode (z.B. EUR)"
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={handleSaveSumupConfig}
              disabled={savingSumupConfig}
            >
              {savingSumupConfig ? <CircularProgress size={20} /> : 'Speichern'}
            </Button>
          </Box>
        </Box>
      )}
    </CardContent>
  </Card>
)}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/hooks/useKostenersatzSumupConfig.ts src/components/Kostenersatz/KostenersatzAdminSettings.tsx
git commit -m "feat: add SumUp admin settings tab with merchant code config"
```

---

### Task 7: Terraform Secrets

**Files:**
- Modify: `terraform/main.tf`

**Step 1: Add secrets management with for_each**

In `terraform/main.tf`, add after the existing `google_artifact_registry_repository` resources (after line 152):

```hcl
# ============================================================================
# Secret Manager
# ============================================================================

locals {
  secrets = toset([
    "AUTH_SECRET",
    "GOOGLE_SERVICE_ACCOUNT",
    "BLAULICHTSMS_USERNAME",
    "BLAULICHTSMS_PASSWORD",
    "BLAULICHTSMS_CUSTOMER_ID",
    "SUMUP_API_KEY",
    "SUMUP_AFFILIATE_KEY",
  ])
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.value
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}

# Import existing secrets
import {
  to = google_secret_manager_secret.secrets["AUTH_SECRET"]
  id = "projects/${var.project}/secrets/AUTH_SECRET"
}

import {
  to = google_secret_manager_secret.secrets["GOOGLE_SERVICE_ACCOUNT"]
  id = "projects/${var.project}/secrets/GOOGLE_SERVICE_ACCOUNT"
}

import {
  to = google_secret_manager_secret.secrets["BLAULICHTSMS_USERNAME"]
  id = "projects/${var.project}/secrets/BLAULICHTSMS_USERNAME"
}

import {
  to = google_secret_manager_secret.secrets["BLAULICHTSMS_PASSWORD"]
  id = "projects/${var.project}/secrets/BLAULICHTSMS_PASSWORD"
}

import {
  to = google_secret_manager_secret.secrets["BLAULICHTSMS_CUSTOMER_ID"]
  id = "projects/${var.project}/secrets/BLAULICHTSMS_CUSTOMER_ID"
}
```

**Step 2: Verify with terraform plan**

Run: `cd terraform && terraform plan`
Expected: Shows 2 secrets to create (SUMUP_API_KEY, SUMUP_AFFILIATE_KEY), 5 to import, and 7 IAM bindings

**Step 3: Commit**

```bash
git add terraform/main.tf
git commit -m "feat: manage all secrets in Terraform with for_each and import existing"
```

---

### Task 8: Update GitHub Actions Pipeline

**Files:**
- Modify: `.github/workflows/cloud-run.yml:160` (deploy step --update-secrets)

**Step 1: Add SumUp secrets to Cloud Run deploy**

In `.github/workflows/cloud-run.yml`, update the `--update-secrets` line in the deploy step (line 160).

Change:
```
--update-secrets="AUTH_SECRET=AUTH_SECRET:latest,GOOGLE_SERVICE_ACCOUNT=GOOGLE_SERVICE_ACCOUNT:latest,BLAULICHTSMS_USERNAME=BLAULICHTSMS_USERNAME:latest,BLAULICHTSMS_PASSWORD=BLAULICHTSMS_PASSWORD:latest,BLAULICHTSMS_CUSTOMER_ID=BLAULICHTSMS_CUSTOMER_ID:latest" \
```

To:
```
--update-secrets="AUTH_SECRET=AUTH_SECRET:latest,GOOGLE_SERVICE_ACCOUNT=GOOGLE_SERVICE_ACCOUNT:latest,BLAULICHTSMS_USERNAME=BLAULICHTSMS_USERNAME:latest,BLAULICHTSMS_PASSWORD=BLAULICHTSMS_PASSWORD:latest,BLAULICHTSMS_CUSTOMER_ID=BLAULICHTSMS_CUSTOMER_ID:latest,SUMUP_API_KEY=SUMUP_API_KEY:latest,SUMUP_AFFILIATE_KEY=SUMUP_AFFILIATE_KEY:latest" \
```

**Step 2: Commit**

```bash
git add .github/workflows/cloud-run.yml
git commit -m "feat: add SumUp secrets to Cloud Run deployment"
```

---

### Task 9: Verify Full Build and Lint

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Fix any remaining issues**

If build or lint fails, fix the issues and commit.

---

### Post-Implementation Checklist

After all tasks are complete:

1. [ ] `terraform apply` to create SUMUP_API_KEY and SUMUP_AFFILIATE_KEY secrets and import existing ones
2. [ ] Manually set secret values in GCP Secret Manager console
3. [ ] Configure merchant code in admin settings (Admin > Kostenersatz > SumUp tab)
4. [ ] Test online payment flow end-to-end with SumUp test/sandbox credentials
5. [ ] Test deep link on mobile device with SumUp app installed
6. [ ] Verify webhook receives payment status updates
