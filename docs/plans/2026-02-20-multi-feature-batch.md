# Multi-Feature Batch: Einsatzorte History & Tagebuch, Column Sorting, Fahrzeuge Redesign, Login UX

**Date:** 2026-02-20
**Status:** Implementation complete, pending review & commit

---

## Goal

Implement four independent UI/UX improvements across the Einsatzkarte app in parallel:

1. Automatic history snapshots when vehicles are assigned to Einsatzorte
2. Automatic Einsatztagebuch entries for Einsatzorte events
3. Clickable column sorting on three table-based pages
4. Fahrzeuge page redesign with layer grouping and compact cards
5. Login page progress feedback during auto-login

---

## Context

The Einsatzkarte app is a PWA for Freiwillige Feuerwehr Neusiedl am See. It uses Next.js 16, React 19, MUI, Leaflet, and Firebase. The four features address different usability gaps:

- **History snapshots** ensure traceability of state changes during operations when vehicles get reassigned
- **Einsatztagebuch entries** automatically document Einsatzorte lifecycle events (creation, status changes, vehicle assignment/unassignment, email imports) in the operational diary
- **Column sorting** gives users flexibility to find entries quickly in growing data tables
- **Fahrzeuge redesign** aligns the vehicles page with the recently improved Ebenen (layers) page design, making it more compact and organized by operational layer
- **Login UX** gives users clear feedback during auto-login so they know whether to wait or sign in manually

---

## Feature 1: Einsatzorte Auto History Snapshot

**Status:** Done

### Summary

When a vehicle is assigned to an Einsatzort, automatically create a history snapshot **before** the assignment is saved, capturing the state prior to the change. Works for both existing map vehicles and Kostenersatz vehicles.

### Implementation

Two vehicle assignment paths exist in the VehicleAutocomplete:

1. **Kostenersatz vehicle** (not yet on map) → `onKostenersatzVehicleSelected` → `handleKostenersatzVehicleSelected` in Einsatzorte.tsx → calls `saveHistory()` then creates/updates vehicle and updates location
2. **Map vehicle** (already exists) → `onMapVehicleSelected` → `handleMapVehicleSelected` in Einsatzorte.tsx → calls `saveHistory()` then updates location vehicles

Both paths call `saveHistory()` with format: `Status vor {vehicleName} zu Einsatzort {locationName} zugeordnet`

Location display name falls back to address (`street number city`) if `name` is empty.

### Files Modified

| File | Change |
|------|--------|
| `src/components/pages/Einsatzorte.tsx` | Added `saveHistory()` in `handleKostenersatzVehicleSelected`, added new `handleMapVehicleSelected` handler, pass both to Card/Table |
| `src/components/Einsatzorte/VehicleAutocomplete.tsx` | Added `onMapVehicleSelected` prop; when provided, map vehicle selection calls it instead of `onChange` |
| `src/components/Einsatzorte/EinsatzorteCard.tsx` | Added `onMapVehicleSelected` prop, thread to VehicleAutocomplete |
| `src/components/Einsatzorte/EinsatzorteRow.tsx` | Added `onMapVehicleSelected` prop, thread to VehicleAutocomplete |
| `src/components/Einsatzorte/EinsatzorteTable.tsx` | Added `onMapVehicleSelected` prop, pass to rows |

### Bug Fix

Initial implementation only covered the Kostenersatz path. Assigning an existing map vehicle went through `handleVehiclesChange` → `handleFieldChange` → direct Firestore write, bypassing `saveHistory()` entirely. Fixed by adding the `onMapVehicleSelected` callback that routes through the parent where `saveHistory()` is called.

---

## Feature 2: Einsatztagebuch Entries for Einsatzorte

**Status:** Done

### Summary

Automatically create numbered diary entries in the Einsatztagebuch when Einsatzorte events occur: location created, status changed, vehicle assigned, vehicle unassigned, and email import.

### Events and Diary Entry Format

| Event | Diary Entry (`name`) | `beschreibung` |
|-------|---------------------|----------------|
| Location created | `Einsatzort {name} angelegt` | `Status: {status}` (if set) |
| Status changed | `Einsatzort {name}: {new status}` | - |
| Vehicle assigned (Kostenersatz) | `{vehicle} zu Einsatzort {name} zugeordnet` | - |
| Vehicle assigned (map) | `{vehicle} zu Einsatzort {name} zugeordnet` | - |
| Vehicle unassigned | `{vehicle} von Einsatzort {name} abgezogen` | - |
| Email import | `{n} Einsatzort(e) per E-Mail importiert` | Comma-separated list of added location names |

All entries are type `M` (Meldung) and receive automatic sequential `nummer` values.

### Implementation

- `addDiaryEntry(name, beschreibung?)` helper in `Einsatzorte.tsx` wraps `useFirecallItemAdd` with auto-numbering
- `diaryCounter` computed from `firecallItems` (reuses existing `useVehicles()` subscription — no extra Firestore listener)
- `diaryCounterRef` tracks current counter and auto-increments to prevent number collisions in rapid succession
- Location display name uses `getLocationDisplayName()`: prefers `name`, falls back to `street number city`, then `Unbekannt`
- Status change detection: compares `updates.status` against current location state
- Vehicle unassignment detection: compares old vs new `vehicles` record to find removed entries
- Email import: `EmailImportResult` extended with `addedNames: string[]` populated from server action

### Files Modified

| File | Change |
|------|--------|
| `src/components/pages/Einsatzorte.tsx` | Added `Diary` import, `getLocationDisplayName()`, `addDiaryEntry()` helper with auto-numbering, diary writes in `handleAdd`, `handleUpdate` (status + vehicle unassignment), `handleKostenersatzVehicleSelected`, `handleMapVehicleSelected`, email import effect |
| `src/components/Einsatzorte/emailImportAction.ts` | Added `addedNames: string[]` to `EmailImportResult`, populated after batch commit |
| `src/hooks/useVehicles.ts` | Exposed `firecallItems` in return value (already subscribed, no extra listener) |

---

## Feature 3: Column Sorting

**Status:** Done

### Summary

Clickable column headers with ascending/descending toggle and arrow indicators on three pages.

### Implementation

For each page:
- `sortField` and `sortDirection` state in the page component
- `useMemo` sorts data client-side based on current sort state
- Click behavior: first click → ascending, second click → descending, click different column → ascending (resets)
- Active column shows up/down arrow icon
- Existing `sortAscending` prop for print views preserved

**Bug fix:** Original implementation nested `setSortDirection` inside a `setSortField` updater callback, which could cause batching issues in React 19. Refactored to use direct state reads via `sortField` dependency instead.

### Pages and Columns

#### Einsatztagebuch (`src/components/pages/EinsatzTagebuch.tsx`)

| Column | Sort Field | Type | Default |
|--------|-----------|------|---------|
| Nummer | `nummer` | number | - |
| Datum | `datum` | date string | desc (default) |
| typ/von/an | `art` | string | - |
| Eintrag | `name` | string | - |
| Beschreibung | `beschreibung` | string | - |

Uses custom `SortableHeader` component with `ArrowUpwardIcon`/`ArrowDownwardIcon`.

#### Einsatzorte (`src/components/Einsatzorte/EinsatzorteTable.tsx`)

| Column | Sort Field | Type | Default |
|--------|-----------|------|---------|
| Bezeichnung | `name` | string | - |
| Adresse | `address` | city+street+number | - |
| Status | `status` | string | - |
| Fahrzeuge | `vehicles` | joined string | - |
| Alarm | `alarmTime` | date string | - |
| Start | `startTime` | date string | - |
| Erledigt | `doneTime` | date string | - |
| Erstellt | `created` | timestamp | asc (default) |

Sort state lives in parent `Einsatzorte.tsx` so it applies to **both** table (desktop) and card (mobile) views. Uses MUI `TableSortLabel` on sortable columns.

#### Geschaeftsbuch (`src/components/pages/Geschaeftsbuch.tsx`)

| Column | Sort Field | Type | Default |
|--------|-----------|------|---------|
| Nummer | `nummer` | number | - |
| Datum | `datum` | date string | desc (default) |
| Ein/Aus | `einaus` | boolean | - |
| von/an | `name` | string | - |
| Beschreibung | `beschreibung` | string | - |
| Erledigt | `erledigt` | date string | - |

Sort state shared across all S-Funktionen tabs.

### Files Modified

| File | Change |
|------|--------|
| `src/components/pages/EinsatzTagebuch.tsx` | Added `DiarySortField` type, `SortableHeader` component, sort state, `sortedDiaries` memo |
| `src/components/pages/Einsatzorte.tsx` | Added sort state, `sortedLocations` memo, pass sort props to table |
| `src/components/Einsatzorte/EinsatzorteTable.tsx` | Added `EinsatzorteSortField` type, MUI `TableSortLabel` on sortable columns |
| `src/components/pages/Geschaeftsbuch.tsx` | Added `GbSortField` type, `GbSortableHeader` component, sort state in parent, sorting in `GbEntries` |

---

## Feature 4: Fahrzeuge Page Redesign

**Status:** Done

### Summary

Redesigned the Fahrzeuge page: items grouped by layer with collapsible sections, compact expandable cards showing icon + title + type chip, expand to see details, edit icon floated right.

### Implementation

- `useVehicles()` for item data, `useFirecallLayers()` for layers
- Items grouped by `layer` field into a `SimpleMap<FirecallItem[]>`
- Each layer rendered as a `LayerGroup` with clickable header, expand/collapse icon, and item count chip
- Items without a layer shown in "Nicht zugeordnet" group
- All sections expanded by default

### Card Design (CompactItemCard)

```
Collapsed:  [icon] Title              [Type Chip] [v]
Expanded:   [icon] Title              [Type Chip] [^]
            Info text (crew, ATS...)      [edit]
            Body text (description...)
```

- Click card header row → expand/collapse details inline
- Expanded view shows `instance.info()` and `instance.body()`
- Edit icon floated to top-right of expanded area, text flows around it
- Edit icon opens `FirecallItemUpdateDialog`
- CSV download button preserved in page header

### Files Modified

| File | Change |
|------|--------|
| `src/components/pages/Fahrzeuge.tsx` | Full rewrite: `CompactItemCard` (expandable with details + edit icon), `LayerGroup` (collapsible section), layer-based grouping |

---

## Feature 5: Login Page Progress Feedback

**Status:** Done

### Summary

Added progress indicators and status messages during auto-login so users know what's happening and whether to wait or sign in manually.

### Implementation

**Not-yet-signed-in state** (auto-login in progress):
- Paper card with `CircularProgress` above the sign-in form
- `isRefreshing` (cached session): "Gespeicherte Anmeldung wird geladen..."
- `isAuthLoading` (no cache): "Anmeldung wird überprüft..."
- Subtitle: "Bitte warten, die automatische Anmeldung läuft."
- Sign-in form remains visible below so user can manually sign in if auto-login fails

**Signed-in refreshing state**:
- Already authorized (from cache): "Berechtigungen werden geladen..."
- Not yet authorized: "Anmeldung wird überprüft..."

**Bug fix**: Added `!isRefreshing` condition to the `!isAuthorized` message, preventing premature "account not activated" message during refresh.

### Auth Flow (User Perspective)

| State | What user sees |
|-------|---------------|
| Page load (cached session) | "Gespeicherte Anmeldung wird geladen..." + sign-in form below |
| Page load (no cache) | "Anmeldung wird überprüft..." + sign-in form below |
| Firebase auth confirmed | "Anmeldung wird überprüft..." or "Berechtigungen werden geladen..." |
| Fully authorized | Normal welcome + "Weiter zur Einsatzkarte" button |
| Not authorized (verified) | "Account not yet activated" message |
| Auto-login fails/times out | Progress banner disappears, sign-in form already visible |

### Files Modified

| File | Change |
|------|--------|
| `src/components/pages/LoginUi.tsx` | Added auto-login progress indicator, improved refresh state messages, fixed premature "not activated" message |

---

## All Files Changed (Summary)

| File | Features |
|------|----------|
| `src/components/pages/Einsatzorte.tsx` | F1 (history), F2 (diary entries), F3 (sorting) |
| `src/components/Einsatzorte/VehicleAutocomplete.tsx` | F1 (onMapVehicleSelected) |
| `src/components/Einsatzorte/EinsatzorteCard.tsx` | F1 (onMapVehicleSelected) |
| `src/components/Einsatzorte/EinsatzorteRow.tsx` | F1 (onMapVehicleSelected) |
| `src/components/Einsatzorte/EinsatzorteTable.tsx` | F1 (onMapVehicleSelected), F3 (sorting) |
| `src/components/Einsatzorte/emailImportAction.ts` | F2 (addedNames in result) |
| `src/hooks/useVehicles.ts` | F2 (expose firecallItems) |
| `src/components/pages/EinsatzTagebuch.tsx` | F3 (sorting) |
| `src/components/pages/Geschaeftsbuch.tsx` | F3 (sorting) |
| `src/components/pages/Fahrzeuge.tsx` | F4 (redesign) |
| `src/components/pages/LoginUi.tsx` | F5 (login UX) |

**Total: 11 files changed**

---

## Decisions Made

| Question | Decision |
|----------|----------|
| History snapshot timing | Before vehicle assignment (captures state prior to change) |
| History snapshot scope | Both map vehicle and Kostenersatz vehicle paths |
| Einsatztagebuch entry approach | Write stored diary entries on events (not synthesized from timestamps) |
| Einsatztagebuch entry numbering | Auto-numbered using existing diary counter from firecallItems subscription |
| Sort UI pattern | Clickable column headers with arrow indicators |
| Unassigned items on Fahrzeuge | Shown in separate "Nicht zugeordnet" collapsible group |
| Drag-and-drop on Fahrzeuge | Not included (display only) |
| Fahrzeuge card detail display | Expand inline on click, edit icon floated right |
| Login auto-login timeout | Sign-in form always visible below progress, no explicit timeout |

---

## Verification

- TypeScript: `tsc --noEmit` passes clean
- ESLint: no new errors (only pre-existing unrelated warnings)
