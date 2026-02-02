# Kostenersatz Email Feature - Design Document

## Overview

Add email sending functionality to the Kostenersatz (cost recovery) feature, allowing users to send calculation PDFs to recipients via email with configurable templates.

## Requirements

- Send emails with PDF attachment to calculation recipients
- Editable email dialog before sending (To, CC, Subject, Body)
- Configurable email templates stored in Firestore (Jinja/nunjucks syntax)
- Admin UI to manage email settings and templates
- Always CC a configured address (with ability to add more)
- Track email sent status on calculations

## Tech Stack

- **Email Provider:** SendGrid (`@sendgrid/mail`)
- **Templating:** nunjucks (Jinja2-compatible)
- **Storage:** Firestore for email config and templates

## Data Model

### Email Config (Firestore)

**Collection:** `kostenersatzConfig`
**Document:** `emailSettings`

```typescript
interface KostenersatzEmailConfig {
  fromEmail: string;        // "verwaltung@ff-neusiedlamsee.at"
  ccEmail: string;          // "kommando@ff-neusiedlamsee.at"
  subjectTemplate: string;  // Jinja template for subject
  bodyTemplate: string;     // Jinja template for body
  updatedAt: string;
  updatedBy: string;
}
```

### Template Variables

Available in both subject and body templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{ recipient.name }}` | Recipient name | "Florinel-Tedi" |
| `{{ firecall.name }}` | Incident name | "Fahrzeug Bergung A4" |
| `{{ firecall.date }}` | Incident date (DD.MM.YYYY) | "30.01.2026" |
| `{{ calculation.totalSum }}` | Total formatted | "1.234,56 €" |

### Default Body Template

```
Sehr geehrte(r) {{ recipient.name }},

Anbei finden Sie die Abrechnung für den Kostenersatz zum Einsatz {{ firecall.name }} am {{ firecall.date }}.
Laut Landesgesetztblatt Nr. 77/2023 des Burgenlandes hat die Feuerwehr das Recht Kostenersatz zu fordern.

Sollte der Kostenersatz nicht vor Ort beglichen sein, bitte den Betrag auf folgendes Konto überweisen:

Freiwillige Feuerwehr Neusiedl am See
AT40 3300 0000 0202 0402
RLBBAT2E



Dear {{ recipient.name }},

Attached you will find the reimbursement for the emergency call {{ firecall.name }} on {{ firecall.date }}.
As by Austrian law (LgBl Nr. 77/2023 Burgenland) die fire departement has the right to request reimbursement.

If the payment didn't take place on the scene, please transfer the pending amount to the following bank account:

Freiwillige Feuerwehr Neusiedl am See
AT40 3300 0000 0202 0402
RLBBAT2E
```

### Default Subject Template

```
Kostenersatz - Feuerwehr Neusiedl am See - {{ firecall.date }}
```

## API Design

### POST `/api/kostenersatz/email`

**Request Body:**
```typescript
{
  firecallId: string;
  calculationId: string;
  to: string;           // Recipient email (can be edited by user)
  cc: string[];         // CC addresses (config address + any added)
  subject: string;      // Rendered/edited subject
  body: string;         // Rendered/edited body
}
```

**Flow:**
1. Authenticate user (must be authorized)
2. Load calculation and firecall from Firestore
3. Generate PDF using existing `@react-pdf/renderer` logic
4. Send email via SendGrid:
   - From: request or config `fromEmail`
   - To: request `to`
   - CC: request `cc` array
   - Subject: request `subject`
   - Body: request `body` (plain text)
   - Attachment: generated PDF
5. Update calculation: `status = 'sent'`, `emailSentAt = now`
6. Return success response

**Response:**
```typescript
{ success: true, emailSentAt: string }
// or
{ error: string, details?: string }
```

## UI Components

### 1. KostenersatzEmailDialog

Modal dialog for sending emails with editable fields.

**Props:**
```typescript
interface KostenersatzEmailDialogProps {
  open: boolean;
  onClose: () => void;
  calculation: KostenersatzCalculation;
  firecall: Firecall;
  rates: KostenersatzRate[];
}
```

**Fields:**
- **To:** Text field, pre-filled from `recipient.email`, editable
- **CC:** Chip input, pre-filled with config CC, can add more addresses
- **Subject:** Text field, pre-rendered from template, editable
- **Body:** Multiline textarea, pre-rendered from template, editable

**Read-only display:**
- **From:** Shown but not editable

**Actions:**
- "Abbrechen" - Close dialog
- "Senden" - Send email (with loading state)

**Validation:**
- To field must be valid email
- CC addresses must be valid emails
- Subject and body must not be empty

### 2. KostenersatzDetailPage

Read-only view of a completed calculation with action buttons.

**Route:** `/einsatz/[firecallId]/kostenersatz/[calculationId]`

**Layout:**
- Header with back button and title
- Calculation summary (same layout as PDF)
- Action buttons:
  - "PDF herunterladen"
  - "Per Email senden" (opens dialog)
  - "Bearbeiten" (if status is draft)
  - "Duplizieren"

### 3. KostenersatzCard Updates

Add "Per Email senden" menu item:
- Icon: `EmailIcon`
- Only enabled when `recipient.email` exists
- Opens `KostenersatzEmailDialog`

### 4. KostenersatzAdminSettings Updates

New section: "E-Mail Einstellungen"

**Fields:**
- From Email (text input)
- CC Email (text input)
- Subject Template (text input)
- Body Template (multiline textarea, ~10 rows)
- Help text showing available template variables

**Actions:**
- "Speichern" - Save to Firestore

## Files to Create

1. **`src/app/api/kostenersatz/email/route.ts`**
   - POST handler for sending emails
   - SendGrid integration
   - PDF generation (reuse existing logic)

2. **`src/components/Kostenersatz/KostenersatzEmailDialog.tsx`**
   - Email send dialog component

3. **`src/components/Kostenersatz/KostenersatzDetailPage.tsx`**
   - Read-only calculation detail view

4. **`src/hooks/useKostenersatzEmailConfig.ts`**
   - Hook to load/save email configuration

5. **`src/common/kostenersatzEmail.ts`**
   - Email config types
   - Template rendering with nunjucks
   - Default templates

6. **`src/app/einsatz/[firecallId]/kostenersatz/[calculationId]/page.tsx`**
   - Detail page route

## Files to Modify

1. **`src/components/Kostenersatz/KostenersatzCard.tsx`**
   - Add email menu item
   - Add `onSendEmail` prop

2. **`src/components/Kostenersatz/KostenersatzAdminSettings.tsx`**
   - Add email settings section

3. **`src/components/Kostenersatz/KostenersatzList.tsx`**
   - Handle email action from card
   - Manage email dialog state

4. **`src/common/kostenersatz.ts`**
   - Add `KOSTENERSATZ_CONFIG_COLLECTION` constant

5. **`package.json`**
   - Add `@sendgrid/mail`
   - Add `nunjucks` and `@types/nunjucks`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key for sending emails |

## Security Considerations

1. **Email addresses in code:** CC and From addresses stored in Firestore, not hardcoded
2. **API authentication:** Email endpoint requires authenticated user
3. **SendGrid API key:** Stored as environment variable, never exposed to client
4. **Email validation:** Validate all email addresses before sending

## Status Flow

```
draft → completed → sent
         ↑           │
         └───────────┘ (can re-send)
```

- Email can only be sent for `completed` or `sent` calculations
- Sending updates status to `sent` and sets `emailSentAt`
- Re-sending updates `emailSentAt` timestamp

## Testing Checklist

- [ ] Email config CRUD in admin settings
- [ ] Template rendering with all variables
- [ ] Email dialog opens with pre-filled values
- [ ] Email dialog validation (empty fields, invalid emails)
- [ ] Successful email send updates calculation status
- [ ] PDF attachment is correct
- [ ] Error handling (SendGrid failures, missing config)
- [ ] CC field allows adding multiple addresses
