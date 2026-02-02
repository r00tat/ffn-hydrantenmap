# Kostenersatz Web App - Design Document

## Overview

A responsive web application to replace the existing spreadsheet for calculating fire department call costs (Kostenersatz) for Freiwillige Feuerwehr Neusiedl am See.

**Primary Goal:** Reduce tedious data entry through templates, quick-select equipment, and smart calculation defaults.

## Users & Access

- **Target users:** Fire department staff only (5-15 users)
- **Authentication:** Google sign-in restricted to `@ff-neusiedlamsee.at` domain
- **Roles:**
  - **User:** Create/view calculations, manage personal templates
  - **Admin:** All user permissions + manage rates, shared templates, users

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router) + MUI |
| Database | Firestore |
| Auth | Firebase Authentication (Google) |
| PDF Generation | Server-side (puppeteer or similar) |
| Email | SendGrid |
| Hosting | Cloud Run (container) |
| Infrastructure | Terraform |
| GCP Project | `ffn-utils` (existing) |

## Data Model

### `users` collection
```typescript
{
  id: string;              // Firebase UID
  email: string;
  name: string;
  role: "user" | "admin";
  createdAt: Timestamp;
}
```

### `calculations` collection
```typescript
{
  id: string;              // Auto-generated
  createdBy: string;       // User ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: "draft" | "completed" | "sent";

  // Call metadata
  callDate: Timestamp;
  callDescription: string;
  comment: string;
  defaultStunden: number;  // Default hours for the call

  // Recipient (embedded, one-off)
  recipient: {
    name: string;
    address: string;
    phone: string;
    email: string;
    paymentMethod: "bar" | "kreditkarte" | "rechnung";
  };

  // Line items (reference rate IDs)
  items: Array<{
    rateId: string;
    einheiten: number;
    anzahlStunden: number;
    stundenOverridden: boolean;  // true if different from defaultStunden
    sum: number;
  }>;

  // Custom Tarif D items only
  customItems: Array<{
    description: string;
    unit: string;
    pricePerUnit: number;
    quantity: number;
    sum: number;
  }>;

  // Subtotals by category
  subtotals: Record<string, number>;

  totalSum: number;

  // PDF/Email tracking
  pdfUrl?: string;
  emailSentAt?: Timestamp;
}
```

### `rates` collection
```typescript
{
  id: string;              // e.g., "1.01"
  category: "A" | "B" | "C" | "D";
  categoryNumber: number;  // 1-12
  categoryName: string;
  description: string;
  unit: string;
  price: number;           // Hourly/per-unit rate
  pricePauschal?: number;  // Flat rate for 5-12h
  isExtendable: boolean;   // true only for Tarif D
  sortOrder: number;
}
```

### `templates` collection
```typescript
{
  id: string;
  name: string;
  description?: string;
  isShared: boolean;       // true = visible to all, false = private
  createdBy: string;       // User ID
  items: Array<{
    rateId: string;
    einheiten: number;
  }>;
  defaultStunden?: number;
}
```

## Calculation Logic

```typescript
function calculateItemSum(
  anzahlStunden: number,
  einheiten: number,
  price: number,
  pricePauschal?: number
): number {
  if (anzahlStunden <= 5) {
    // Hourly rate for first 5 hours
    return einheiten * anzahlStunden * price;
  } else {
    // Pauschal rate kicks in at hour 6+
    // First pauschal covers hours 1-12
    // Each additional started 12h block adds another pauschal
    const pauschalBlocks = Math.ceil(anzahlStunden / 12);
    return einheiten * pauschalBlocks * pricePauschal;
  }
}
```

**Examples (price=63.70€, pricePauschal=318.50€, einheiten=1):**

| Hours | Calculation | Sum |
|-------|-------------|-----|
| 3h | 1 × 3 × 63.70 | 191.10€ |
| 5h | 1 × 5 × 63.70 | 318.50€ |
| 6h | 1 × 1 × 318.50 | 318.50€ |
| 12h | 1 × 1 × 318.50 | 318.50€ |
| 13h | 1 × 2 × 318.50 | 637.00€ |
| 24h | 1 × 2 × 318.50 | 637.00€ |
| 25h | 1 × 3 × 318.50 | 955.50€ |

## UI Screens

### Mobile-first with bottom navigation

**Navigation items:**
- Dashboard (Home)
- Neue Berechnung
- Vorlagen
- Einstellungen (Admin section visible only to admins)

### 1. Login Screen
- Google sign-in button
- Fire department logo/branding
- Error message for non-authorized domains

### 2. Dashboard
- Quick actions: "Neue Berechnung", "Aus Vorlage"
- Recent calculations list with status badges (Entwurf/Abgeschlossen/Gesendet)
- Search/filter by date, recipient name

### 3. New/Edit Calculation

**Tabbed layout (freely navigable, any order):**

#### Tab: Einsatz (shown first)
- Datum (date picker)
- Einsatzbeschreibung (text)
- Kommentar (text)
- Einsatzdauer in Stunden (number) - default hours for all items

#### Tab: Berechnung
- All 12 tariff categories as expandable accordion sections
- Tap category → see all items with input fields
- Enter Einheiten (quantity) and optionally override Stunden per item
- Items with values get highlighted
- Category headers show subtotals
- **Sticky footer:** Total sum always visible
- "Vorlage anwenden" button to apply a template

**Accordion structure:**
```
▼ 1. Mannschaft und Fahrtkostenersatz    291,60 €
   1.01 Personalaufwand...     [3] Pers  [3]h   291,60 €
   1.02 Kommissionsdienst...   [ ]       [ ]      0,00 €
   ...

▶ 2. Fahrzeuge und Anhänger              318,50 €
▶ 3. Löschgeräte, Schläuche...             0,00 €
...
─────────────────────────────────────────────────────────
Gesamt                                       610,10 €
```

#### Tab: Empfänger
- Name (text)
- Adresse (text/textarea)
- Telefonnummer (text)
- Email (email)
- Bezahlung via (dropdown):
  - "Bar: Betrag eingehoben"
  - "Kreditkarte: Betrag eingehoben"
  - "Rechnung: Betrag ausständig"

### 4. Calculation Detail
- Full breakdown by category (only items with values)
- Actions:
  - PDF herunterladen
  - Per Email senden
  - Bearbeiten (if draft)
  - Duplizieren
  - Als Vorlage speichern

### 5. Templates
- **Meine Vorlagen** (private, user-created)
- **Gemeinsame Vorlagen** (shared, admin-created)
- Create/edit/delete templates

### 6. Settings (Admin only)

#### Tarif-Sätze verwalten
- List all tariff items by category
- Edit price and pricePauschal values
- **"Standard-Tarife laden"** button - reset to app defaults
- Add custom Tarif D items

#### Gemeinsame Vorlagen
- Create/edit/delete shared templates

#### Benutzer verwalten
- List users with roles
- Promote/demote user ↔ admin

## PDF Generation

**Layout:**
- **Header:** Logo (ND_Neusiedl am See_klassisch.png) + "Kostenersatz Berechnung"
- **Call info:** Einsatz, Datum, Kommentar
- **Recipient:** Name, Adresse, Telefon, Email, Bezahlung via
- **Body:** Only tariff categories and items with values > 0
- **Total:** "Summe lt Tarifordnung" + amount
- **Footer:**
  - "Die Berechnung erfolgt laut Landesgesetzblatt Nr. 77/2023"
  - Fire department contact info
  - Bank details (IBAN, BIC)

**Technical:** Server-side generation via Next.js API route using puppeteer or similar.

## Email Integration

- **Provider:** SendGrid
- **Trigger:** User clicks "Per Email senden"
- **To:** Recipient email from calculation
- **Subject:** "Kostenersatz - Feuerwehr Neusiedl am See - [Datum]"
- **Body:** Summary text, total amount, bank details
- **Attachment:** Generated PDF
- **Tracking:** `emailSentAt` timestamp stored in calculation

## Security

### Firebase Auth
- Google sign-in only
- Restricted to `@ff-neusiedlamsee.at` domain
- Client-side check after sign-in, sign out if invalid domain

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isValidDomain() {
      return request.auth.token.email.matches('.*@ff-neusiedlamsee[.]at$');
    }

    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /users/{userId} {
      allow read: if isSignedIn() && isValidDomain();
      allow write: if isSignedIn() && isValidDomain() && isAdmin();
    }

    match /calculations/{calcId} {
      allow read: if isSignedIn() && isValidDomain();
      allow create: if isSignedIn() && isValidDomain();
      allow update, delete: if isSignedIn() && isValidDomain()
        && (resource.data.createdBy == request.auth.uid || isAdmin());
    }

    match /rates/{rateId} {
      allow read: if isSignedIn() && isValidDomain();
      allow write: if isSignedIn() && isValidDomain() && isAdmin();
    }

    match /templates/{templateId} {
      allow read: if isSignedIn() && isValidDomain();
      allow create: if isSignedIn() && isValidDomain();
      allow update, delete: if isSignedIn() && isValidDomain()
        && (resource.data.createdBy == request.auth.uid || isAdmin());
    }
  }
}
```

## Project Structure

```
/src
  /app                      # Next.js App Router
    /page.tsx               # Landing/login page
    /(auth)                 # Protected routes
      /dashboard
      /calculation/[id]
      /calculation/new
      /templates
      /settings
    /api
      /pdf/route.ts         # PDF generation
      /email/route.ts       # SendGrid email

  /components
    /ui                     # MUI-based components
    /calculation            # Calculation-specific
    /layout                 # Navigation, headers

  /lib
    /firebase.ts            # Firebase client init
    /firestore.ts           # Firestore helpers
    /defaultRates.ts        # Default tariff rates
    /calcLogic.ts           # Price calculation
    /pdf.ts                 # PDF generation

  /hooks                    # React hooks

  /types                    # TypeScript interfaces

/terraform
  /main.tf                  # Provider, backend
  /firestore.tf             # Firestore database
  /cloud-run.tf             # Cloud Run service
  /iam.tf                   # Service accounts
  /secrets.tf               # Secret Manager
  /variables.tf
  /outputs.tf

/Dockerfile
/public
  /images                   # Logo, assets
```

## Terraform Resources

- Firestore database (Native mode)
- Cloud Run service
- Service account for Cloud Run
- Secret Manager secrets:
  - `sendgrid-api-key`
  - `firebase-admin-credentials`
- IAM bindings:
  - Cloud Run service account → Secret Manager access
  - Cloud Run service account → Firestore access
- Artifact Registry for container images
- Optional: Cloud Build trigger for CI/CD

## Environment Variables (from Secret Manager)

| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key for email |
| `FIREBASE_ADMIN_CREDENTIALS` | Firebase Admin SDK credentials JSON |

## Deployment Flow

1. `terraform apply` - creates infrastructure
2. Build container image
3. Push to Artifact Registry
4. Deploy to Cloud Run (via Terraform or gcloud)
5. Seed Firestore with default rates (first deployment)
6. Manually set first admin user in Firestore

## Initial Setup Tasks

1. Create Firebase app in `ffn-utils` project
2. Enable Authentication with Google provider
3. Configure authorized domain restriction
4. Run Terraform to create infrastructure
5. Build and deploy container
6. Seed `rates` collection with default tariffs from `defaultRates.ts`
7. Create first admin user manually in Firestore
8. Configure SendGrid (verify sender, get API key)
