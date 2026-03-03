# SumUp Payment Integration for Kostenersatz

## Summary

Integrate SumUp payments into the Kostenersatz (cost recovery) feature with two payment flows:
1. **Online payment** via SumUp Hosted Checkout (opens SumUp-hosted payment page)
2. **App payment** via deep link (opens SumUp app for card-present payment)

Payment status is tracked via webhook and displayed in real-time on the Kostenersatz calculation.

## Architecture

```
Kostenersatz Calculation (Empfaenger Tab)
  |
  |-- "Online bezahlen" button (sumup_online)
  |     |-> Server Action: createSumupCheckout()
  |     |-> POST /v0.1/checkouts (hosted_checkout: true)
  |     |-> Opens hosted_checkout_url in new tab
  |     |-> Webhook updates payment status in Firestore
  |
  |-- "In SumUp App bezahlen" button (sumup_app)
        |-> Server Action: getSumupDeepLink()
        |-> Returns sumupmerchant:// URL
        |-> Opens SumUp app on mobile
```

Server-side only: API key and affiliate key never reach the client. Frontend receives only the payment URL/deep link.

## Data Model

### Payment method union (extended)

```typescript
paymentMethod: 'bar' | 'kreditkarte' | 'rechnung' | 'sumup_online' | 'sumup_app'
```

PDF text mapping:
- `sumup_online` -> "Onlinezahlung (SumUp)"
- `sumup_app` -> "Kartenzahlung (SumUp)"

### New fields on KostenersatzCalculation

```typescript
sumupCheckoutId?: string         // SumUp checkout UUID
sumupCheckoutRef?: string        // Our reference (e.g., "KE-{firecallId}-{calcId}")
sumupPaymentStatus?: 'pending' | 'paid' | 'failed' | 'expired'
sumupPaidAt?: string             // ISO timestamp when payment confirmed
sumupTransactionCode?: string    // SumUp transaction code for reconciliation
```

No new Firestore collections. Fields live on existing `/call/{firecallId}/kostenersatz/{calculationId}` documents.

### Admin config

Stored at `/kostenersatzConfig/sumupSettings`:

```typescript
{
  merchantCode: string   // e.g., "ME7RMQN3"
  currency: string       // "EUR"
  redirectUrl?: string   // Post-payment redirect URL
}
```

## Server-Side Components

### Environment variables (runtime secrets in GCP Secret Manager)

- `SUMUP_API_KEY` -- bearer token for Checkouts API (sup_sk_live_...)
- `SUMUP_AFFILIATE_KEY` -- for deep link construction

### Server Actions -- src/components/Kostenersatz/sumupActions.ts

Both actions are guarded with:
1. `actionUserAuthorizedForFirecall(firecallId)` -- firecall access
2. Session `groups` includes `'kostenersatz'` -- group membership check

**createSumupCheckout(firecallId, calculationId)**:
1. Reads calculation from Firestore for `totalSum`
2. Reads merchant config from `/kostenersatzConfig/sumupSettings`
3. POST /v0.1/checkouts with hosted_checkout enabled, return_url (webhook), redirect_url (back to app)
4. Saves sumupCheckoutId, sumupCheckoutRef, sets sumupPaymentStatus: 'pending'
5. Returns hosted_checkout_url to frontend

**getSumupDeepLink(firecallId, calculationId)**:
1. Reads calculation for `totalSum`
2. Constructs `sumupmerchant://pay/1.0?affiliate-key=...&total=...&currency=EUR&title=...&foreign-tx-id=...`
3. Returns URL string

### Webhook API Route -- src/app/api/sumup/webhook/route.ts

1. Receives POST from SumUp: `{ event_type, id }`
2. Responds 200 immediately
3. Calls GET /v0.1/checkouts/{id} with API key to verify status
4. Finds calculation by sumupCheckoutId in Firestore
5. Updates sumupPaymentStatus, sets sumupPaidAt if paid
6. Ignores unknown event types

No user authentication on webhook (called by SumUp servers). Secured by verification via API callback.

## Frontend Components

### Empfaenger Tab (KostenersatzEmpfaengerTab.tsx)

- Add `sumup_online` and `sumup_app` to payment method selector
- When `sumup_online` selected: show "Online bezahlen" button
  - Calls createSumupCheckout() server action
  - Opens returned hosted_checkout_url in new tab
  - Shows status chip (pending/paid/failed/expired)
- When `sumup_app` selected: show "In SumUp App bezahlen" button
  - Calls getSumupDeepLink() server action
  - Opens sumupmerchant:// URL

Payment status updates appear in real-time via existing Firestore listeners.

### Admin Settings (KostenersatzAdminSettings.tsx)

Add "SumUp" section with fields for merchant code and currency.

### PDF (KostenersatzPdf.tsx)

| Value | PDF Text |
|-------|----------|
| bar | Barzahlung |
| kreditkarte | Kreditkarte |
| rechnung | Rechnung |
| sumup_online | Onlinezahlung (SumUp) |
| sumup_app | Kartenzahlung (SumUp) |

## Infrastructure

### Terraform (terraform/main.tf)

All secrets managed via a single map with for_each. Existing secrets imported via import blocks.

```hcl
locals {
  secrets = toset([
    # existing (imported)
    "AUTH_SECRET",
    "GOOGLE_SERVICE_ACCOUNT",
    "BLAULICHTSMS_USERNAME",
    "BLAULICHTSMS_PASSWORD",
    "BLAULICHTSMS_CUSTOMER_ID",
    # new
    "SUMUP_API_KEY",
    "SUMUP_AFFILIATE_KEY",
  ])
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = local.secrets
  secret_id = each.value
  project   = var.project
  replication { auto {} }
}

resource "google_secret_manager_secret_iam_member" "secret_access" {
  for_each  = local.secrets
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.run_sa.member
}
```

Import blocks for all 5 existing secrets.

### GitHub Actions (.github/workflows/cloud-run.yml)

Add to --update-secrets in deploy step:
```
,SUMUP_API_KEY=SUMUP_API_KEY:latest,SUMUP_AFFILIATE_KEY=SUMUP_AFFILIATE_KEY:latest
```

## SumUp API Reference

- Base URL: https://api.sumup.com
- Create checkout: POST /v0.1/checkouts
- Get checkout: GET /v0.1/checkouts/{id}
- Hosted checkout session: 30 minutes before expiry
- Webhook retries: 1 min, 5 min, 20 min, 2 hours
- Online payment fee: 2.50% per transaction
- Deep link scheme: sumupmerchant://pay/1.0
