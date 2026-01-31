# Kostenersatz Integration Plan

## Overview

Integrate the Kostenersatz (cost recovery) calculation feature into the existing Einsatzkarte app, leveraging existing infrastructure, authentication, and patterns rather than building a standalone application.

## Benefits of Integration

- **Reduced data entry**: Auto-populate from existing firecall data (date, description, vehicles, personnel)
- **Unified authentication**: Use existing Firebase Auth + NextAuth.js setup
- **Consistent UX**: Same MUI patterns, navigation, and styling
- **Shared infrastructure**: Same Firestore database, deployment pipeline
- **Direct firecall linkage**: Calculations tied to actual operations

---

## Data Model Changes

### 1. New `kostenersatzRates` Collection

Store tariff rates separately from calculations for easy admin management.

```typescript
// Firestore: /kostenersatzRates/{rateId}
// rateId format: "{version}_{itemId}" e.g., "LGBl_77_2023_1.01"
interface KostenersatzRate {
  id: string; // e.g., "1.01"
  version: string; // e.g., "LGBl_77_2023"
  validFrom: string; // ISO date when this version became active
  category: 'A' | 'B' | 'C' | 'D';
  categoryNumber: number; // 1-12
  categoryName: string;
  description: string;
  unit: string;
  price: number; // Hourly/per-unit rate
  pricePauschal?: number; // Flat rate for 5-12h
  isExtendable: boolean; // Only Tarif D items
  sortOrder: number;
}

// Firestore: /kostenersatzVersions/{versionId}
interface KostenersatzVersion {
  id: string; // e.g., "LGBl_77_2023"
  name: string; // e.g., "LGBl. Nr. 77/2023"
  validFrom: string; // ISO date
  isActive: boolean; // Currently active version for new calculations
  createdAt: string;
  createdBy: string;
}
```

### 2. New `kostenersatzTemplates` Collection

```typescript
// Firestore: /kostenersatzTemplates/{templateId}
interface KostenersatzTemplate {
  id: string;
  name: string;
  description?: string;
  isShared: boolean; // true = visible to all
  createdBy: string; // User email
  items: Array<{
    rateId: string;
    einheiten: number;
  }>;
  defaultStunden?: number;
}
```

### 3. New Subcollection on Firecalls

Store calculations as a subcollection under the parent firecall.

```typescript
// Firestore: /call/{firecallId}/kostenersatz/{calculationId}
interface KostenersatzCalculation {
  id: string;
  createdBy: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  status: 'draft' | 'completed' | 'sent';
  rateVersion: string; // Version of rates used, e.g., "LGBl_77_2023"

  // Override firecall defaults if needed
  callDateOverride?: string;
  callDescriptionOverride?: string;
  comment: string;
  defaultStunden: number;

  // Recipient (embedded)
  recipient: {
    name: string;
    address: string;
    phone: string;
    email: string;
    paymentMethod: 'bar' | 'kreditkarte' | 'rechnung';
  };

  // Line items
  items: Array<{
    rateId: string;
    einheiten: number;
    anzahlStunden: number;
    stundenOverridden: boolean;
    sum: number;
  }>;

  // Custom Tarif D items
  customItems: Array<{
    description: string;
    unit: string;
    pricePerUnit: number;
    quantity: number;
    sum: number;
  }>;

  subtotals: Record<string, number>;
  totalSum: number;

  // PDF/Email tracking
  pdfUrl?: string;
  emailSentAt?: string;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Core Data & Types)

1. **Type definitions** (`src/common/kostenersatz.ts`)
   - `KostenersatzRate`, `KostenersatzTemplate`, `KostenersatzCalculation` interfaces
   - Calculation logic functions

2. **Default rates data** (`src/common/defaultKostenersatzRates.ts`)
   - All 12 tariff categories with default prices from Landesgesetzblatt 77/2023

3. **Firestore hooks** (`src/hooks/useKostenersatz.ts`)
   - `useKostenersatzRates()` - Load rates collection
   - `useKostenersatzTemplates()` - Load templates with filter (personal/shared)
   - `useFirecallKostenersatz(firecallId)` - Load calculations for a firecall
   - `useKostenersatzCalculation(firecallId, calcId)` - Load single calculation

4. **CRUD hooks**
   - `useKostenersatzAdd()` - Create new calculation
   - `useKostenersatzUpdate()` - Update calculation
   - `useKostenersatzDelete()` - Delete calculation

### Phase 2: UI Components

1. **Calculation Editor** (`src/components/Kostenersatz/`)
   - `KostenersatzDialog.tsx` - Main calculation dialog (tabbed)
   - `KostenersatzEinsatzTab.tsx` - Call info tab (pre-filled from firecall)
   - `KostenersatzBerechnungTab.tsx` - Tariff items accordion
   - `KostenersatzEmpfaengerTab.tsx` - Recipient form
   - `KostenersatzItemRow.tsx` - Single tariff item input row
   - `KostenersatzCategoryAccordion.tsx` - Category with subtotal
   - `KostenersatzSummaryFooter.tsx` - Sticky total footer

2. **List & Detail Views**
   - `KostenersatzList.tsx` - List calculations for a firecall
   - `KostenersatzDetail.tsx` - Read-only view with actions
   - `KostenersatzCard.tsx` - Summary card for list display

3. **Template Management**
   - `KostenersatzTemplateDialog.tsx` - Create/edit templates
   - `KostenersatzTemplateList.tsx` - List with personal/shared tabs
   - `KostenersatzTemplateSelector.tsx` - Quick-apply dropdown

### Phase 3: Pages & Navigation

1. **New page** (`src/app/einsatz/[firecallId]/kostenersatz/page.tsx`)
   - List all calculations for the current firecall
   - Create new calculation button
   - Apply template quick action

2. **Calculation detail page** (`src/app/einsatz/[firecallId]/kostenersatz/[calcId]/page.tsx`)
   - View calculation details
   - Actions: Edit, Duplicate, PDF, Email, Delete

3. **Admin settings page** (`src/app/admin/kostenersatz/page.tsx`)
   - Manage tariff rates
   - Reset to defaults button
   - Manage shared templates

4. **Navigation integration**
   - Add "Kostenersatz" to firecall menu/sidebar
   - Show calculation count badge on firecall cards

### Phase 4: PDF Generation

1. **API route** (`src/app/api/kostenersatz/pdf/route.ts`)
   - Server-side PDF generation
   - Uses existing Firebase Admin SDK
   - Return PDF as blob or upload to Storage

2. **PDF template**
   - Header with FF logo
   - Call info, recipient, itemized breakdown
   - Total with bank details
   - Reference to Landesgesetzblatt 77/2023

3. **PDF library options**
   - `@react-pdf/renderer` (React-based, good for complex layouts)
   - `pdf-lib` (lightweight, programmatic)
   - `puppeteer` (HTML to PDF, heavier but flexible)

### Phase 5: Email Integration

1. **API route** (`src/app/api/kostenersatz/email/route.ts`)
   - SendGrid integration
   - Attach generated PDF
   - Track `emailSentAt`

2. **Email configuration**
   - Add `SENDGRID_API_KEY` to environment
   - Configure sender verification

---

## UI/UX Design

### Entry Points

1. **From Einsaetze page**: Add "Kostenersatz" icon button to firecall cards
2. **From Einsatz map view**: Add menu item in sidebar when firecall is selected
3. **From firecall header**: Add tab or dropdown option

### Calculation Flow

```
1. User opens firecall → clicks "Kostenersatz"
2. See list of existing calculations (or empty state)
3. Click "Neue Berechnung" or "Aus Vorlage"
4. Dialog opens with 3 tabs:

   Tab 1: Einsatz (pre-filled)
   - Datum: [from firecall.date]
   - Beschreibung: [from firecall.name + description]
   - Kommentar: [empty]
   - Einsatzdauer: [calculated from alarmierung/abruecken or manual]

   Tab 2: Berechnung
   - 12 accordion sections, one per category
   - Each item: [Einheiten] [Stunden] → Sum
   - Sticky footer with running total

   Tab 3: Empfänger
   - Name, Address, Phone, Email
   - Payment method selector

5. Save as draft or complete
6. From detail view: Download PDF, Send email
```

### Smart Defaults & Pre-filling

- **Einsatzdauer**: Pre-calculated from `abruecken - alarmierung` if both exist, but **always editable** by the user. The calculated value is just a suggestion - users can override it freely.
- **Date & Description**: Pre-filled from firecall but can be overridden via `callDateOverride` and `callDescriptionOverride` fields
- **Personnel**: Optionally pre-fill from vehicle `besatzung` fields
- **Vehicles**: Optionally suggest tariff items based on vehicles in firecall

---

## File Structure

```
src/
├── common/
│   ├── kostenersatz.ts              # Types & calculation logic
│   └── defaultKostenersatzRates.ts  # Default tariff data
│
├── hooks/
│   ├── useKostenersatz.ts           # Read hooks
│   ├── useKostenersatzAdd.ts        # Create hook
│   ├── useKostenersatzUpdate.ts     # Update hook
│   └── useKostenersatzTemplates.ts  # Template hooks
│
├── components/
│   └── Kostenersatz/
│       ├── KostenersatzDialog.tsx
│       ├── KostenersatzEinsatzTab.tsx
│       ├── KostenersatzBerechnungTab.tsx
│       ├── KostenersatzEmpfaengerTab.tsx
│       ├── KostenersatzItemRow.tsx
│       ├── KostenersatzCategoryAccordion.tsx
│       ├── KostenersatzSummaryFooter.tsx
│       ├── KostenersatzList.tsx
│       ├── KostenersatzDetail.tsx
│       ├── KostenersatzCard.tsx
│       ├── KostenersatzTemplateDialog.tsx
│       ├── KostenersatzTemplateList.tsx
│       └── KostenersatzTemplateSelector.tsx
│
├── app/
│   ├── einsatz/
│   │   └── [firecallId]/
│   │       └── kostenersatz/
│   │           ├── page.tsx         # List view
│   │           └── [calcId]/
│   │               └── page.tsx     # Detail view
│   ├── admin/
│   │   └── kostenersatz/
│   │       └── page.tsx             # Admin settings
│   └── api/
│       └── kostenersatz/
│           ├── pdf/
│           │   └── route.ts         # PDF generation
│           └── email/
│               └── route.ts         # Email sending
│
└── server/
    └── kostenersatz/
        └── pdf.ts                   # PDF generation logic
```

---

## Firestore Security Rules

Add to existing rules:

```javascript
// Kostenersatz rates - read all, admin write
match /kostenersatzRates/{rateId} {
  allow read: if isAuthorized();
  allow write: if isAdmin();
}

// Kostenersatz templates
match /kostenersatzTemplates/{templateId} {
  allow read: if isAuthorized();
  allow create: if isAuthorized();
  allow update, delete: if isAuthorized() &&
    (resource.data.createdBy == request.auth.token.email || isAdmin());
}

// Kostenersatz calculations (nested under firecalls)
match /call/{firecallId}/kostenersatz/{calcId} {
  allow read: if isAuthorized();
  allow create: if isAuthorized();
  allow update, delete: if isAuthorized() &&
    (resource.data.createdBy == request.auth.token.email || isAdmin());
}
```

---

## Environment Variables

Add to `.env.local`:

```bash
# SendGrid for Kostenersatz emails
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=kostenersatz@ff-neusiedlamsee.at
```

---

## Migration & Seeding

1. **Seed rates**: Create script to populate `kostenersatzRates` from `defaultKostenersatzRates.ts`
2. **No user migration needed**: Uses existing auth system
3. **No data migration**: New feature, no existing data

---

## Implementation Order

| Order | Task                                   | Effort |
| ----- | -------------------------------------- | ------ |
| 1     | Types & calculation logic              | S      |
| 2     | Default rates data file (with version) | S      |
| 3     | Rate versioning system                 | M      |
| 4     | Firestore hooks (read)                 | M      |
| 5     | CRUD hooks                             | M      |
| 6     | KostenersatzDialog + tabs              | L      |
| 7     | Accordion & item components            | M      |
| 8     | Vehicle-to-tariff mapping & auto-fill  | M      |
| 9     | List page + routing                    | M      |
| 10    | Detail page                            | M      |
| 11    | Template system                        | M      |
| 12    | Admin settings page (rates + versions) | M      |
| 13    | PDF generation (@react-pdf/renderer)   | L      |
| 14    | Email integration                      | M      |
| 15    | Navigation integration                 | S      |
| 16    | Testing & polish                       | M      |

**Total estimate**: ~2-3 weeks of focused development

---

## Design Decisions

### 1. PDF Library: `@react-pdf/renderer`

React-based, declarative approach that fits well with the existing codebase patterns.

### 2. Auto-Population from Firecall Data

**Approach**: Provide a "Daten übernehmen" (import data) button that populates fields from firecall when clicked.

**Implementation needs**:

- Vehicle-to-tariff mapping configuration (e.g., TLF → Tariff 2.01, KLF → Tariff 2.03)
- Could be admin-configurable or use intelligent matching based on vehicle names
- Personnel count from `besatzung` fields on vehicles

### 3. Rate Versioning

**Approach**: Version the tariffs with admin control.

- Each rate set has a version identifier (e.g., "LGBl 77/2023")
- Calculations store the rate version they were created with
- Admin can choose when editing rates: update current version OR create new version
- Old calculations retain their original rate version for historical accuracy

**Data model addition**:

```typescript
interface KostenersatzRate {
  // ... existing fields
  version: string; // e.g., "LGBl_77_2023"
  validFrom: string; // ISO date when this version became active
}

interface KostenersatzCalculation {
  // ... existing fields
  rateVersion: string; // Version used for this calculation
}
```

### 4. Multiple Calculations per Firecall

**Confirmed**: Yes, multiple calculations allowed per firecall. The subcollection design (`/call/{firecallId}/kostenersatz/`) supports this naturally.

### 5. Offline Support

**Decision**: Online-only. Keeps implementation simpler since PDF generation and email require connectivity anyway.

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (types, default rates, hooks)
3. Build minimal viable dialog for creating a calculation
4. Iterate on UI based on feedback
