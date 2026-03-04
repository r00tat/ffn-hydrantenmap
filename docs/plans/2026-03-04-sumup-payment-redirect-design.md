# SumUp Payment Redirect & Auto-Close Design

## Problem

After SumUp online payment, the payer's browser redirects to the calculation page which requires authentication — causing a client-side error. The payer is an external person without an account.

Additionally, paid calculations should auto-close and send email notifications, and recipient contact details should remain editable after closing.

## Design

### 1. Public Redirect Page

**Route**: `/einsatz/[firecallId]/kostenersatz/[calculationId]/payment?token={token}`

A **server component** (no client-side Firebase auth). Flow:

1. At checkout creation, generate a random UUID token stored as `sumupRedirectToken` on the calculation doc
2. `redirect_url` sent to SumUp includes the token as query param
3. On page load, a server action:
   - Loads calculation from Firestore (admin SDK)
   - Verifies `token` matches `calculation.sumupRedirectToken`
   - Verifies payment with SumUp API using `calculation.sumupCheckoutId`
   - If paid: triggers `completePaymentAndNotify()`, returns success data
   - If not paid/invalid token: shows error message
4. Success page shows: "Zahlung erfolgreich", paid amount, reference number, PDF download link
5. Also triggers close+email as fallback (idempotent — skips if webhook already handled it)

### 2. Public PDF Download Endpoint

**Route**: `/api/kostenersatz/pdf/[calculationId]?token={token}&firecallId={firecallId}`

- Verifies `token` matches `calculation.sumupRedirectToken`
- Generates and streams the PDF (reuses existing PDF generation logic)
- No authentication required — token is the authorization

### 3. Shared `completePaymentAndNotify` Function

Extracted from email action into a shared server-side helper. Called by:
- Webhook (when `sumupPaymentStatus` becomes `paid`)
- Redirect page (fallback)
- `checkSumupPaymentStatus` poll action (app payment flow)

**Logic**:
1. Load calculation from Firestore
2. **Idempotency**: skip if `status` is already `completed` or `sent`
3. Set `status: 'completed'`
4. Load email config from `kostenersatzConfig/emailSettings`
5. Determine recipient:
   - If `calculation.recipient.email` exists → send to that address, CC to `config.ccEmail`
   - If no recipient email → send to `config.ccEmail` only
6. Render email subject+body from Nunjucks templates
7. Generate PDF, send via Gmail API
8. Update `status: 'sent'`, `emailSentAt`

### 4. Webhook & Poll Action Enhancement

**Webhook** (`/api/sumup/webhook`): After setting `sumupPaymentStatus: 'paid'`, also calls `completePaymentAndNotify(firecallId, calculationId)`.

**`checkSumupPaymentStatus`** (poll action): When detecting `paid`, also calls `completePaymentAndNotify()`. The existing refresh button on the Empfänger tab triggers this — so for app payments, pressing refresh after the SumUp app returns will auto-close and email.

Both paths are idempotent — the first to run closes the calculation, the second is a no-op.

### 5. Recipient Contact Fields Always Editable

**Current**: `isEditable = status === 'draft'` disables the entire Empfänger tab after closing.

**Change**: Recipient contact fields (name, address, phone, email) are **never disabled** regardless of calculation status. Only the payment method selector respects the `disabled` prop.

In `KostenersatzEmpfaengerTab`: contact field `disabled` props are removed (always enabled). Payment method `disabled` prop unchanged.

In `KostenersatzCalculationPage`: when `!isEditable` (completed/sent), show an "Empfänger speichern" button that updates only `recipient` fields on the Firestore doc. The "E-Mail" button remains available for re-sending.

## Data Model Changes

Add to `KostenersatzCalculation`:
```typescript
sumupRedirectToken?: string;  // Random UUID for public page authorization
```

## Files to Modify

| File | Change |
|------|--------|
| `src/common/kostenersatz.ts` | Add `sumupRedirectToken` to type |
| `src/components/Kostenersatz/sumupActions.ts` | Generate token at checkout creation, add to `redirect_url` |
| `src/app/api/sumup/webhook/route.ts` | Call `completePaymentAndNotify` on `paid` |
| `src/components/Kostenersatz/kostenersatzEmailAction.ts` | Extract core email logic into shared function |
| `src/components/Kostenersatz/KostenersatzEmpfaengerTab.tsx` | Contact fields always enabled |
| `src/components/Kostenersatz/KostenersatzCalculationPage.tsx` | "Empfänger speichern" button when closed |

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/einsatz/[firecallId]/kostenersatz/[calculationId]/payment/page.tsx` | Public redirect page (server component) |
| `src/components/Kostenersatz/completePaymentAndNotify.ts` | Shared close+email helper |
| `src/app/api/kostenersatz/pdf/[calculationId]/route.ts` | Public token-verified PDF download |
