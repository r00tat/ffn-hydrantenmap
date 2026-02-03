# Kostenersatz Vehicle Selection Design

**Date:** 2026-02-02
**Status:** Draft

## Overview

Add a vehicle quick-selection feature to Kostenersatz calculations. Admins can configure the fire department's vehicles (mapped to rate categories 2, 4, 8), and users can quickly select which vehicles were at the scene during a calculation.

## Requirements

1. **Admin Vehicle Management:** Admins can add/edit/delete vehicles in the admin page, each mapped to a rate from categories 2 (Fahrzeuge), 4 (Geräte mit motorischem Antrieb), or 8 (Wasserdienst)
2. **Quick-Add Panel:** Collapsible panel in calculation view showing department vehicles as toggle chips
3. **Toggle Behavior:** Click to add vehicle (1 unit, default hours), click again to remove
4. **Template Integration:** Templates save which vehicles were selected and restore them when loaded
5. **Seed Method:** Button to populate default vehicles from hardcoded list
6. **Admin UI Tabs:** Split Kostenersatz admin into 4 tabs: Tarife, Fahrzeuge, Vorlagen, E-Mail

## Data Model

### New Type: KostenersatzVehicle

```typescript
interface KostenersatzVehicle {
  id: string;           // e.g., "kdtfa", "rlfa-3000"
  name: string;         // e.g., "KDTFA", "RLFA 3000/100"
  rateId: string;       // e.g., "2.01", "2.05"
  description?: string; // e.g., "Kommando Neusiedl am See"
  sortOrder: number;    // For consistent display order
}
```

### Firestore Collection

- Collection: `kostenersatzVehicles`
- Documents keyed by vehicle ID

### Updated Types

**KostenersatzTemplate** (add field):
```typescript
vehicles?: string[];  // Array of vehicle IDs
```

**KostenersatzCalculation** (add field):
```typescript
vehicles?: string[];  // Array of selected vehicle IDs
```

## Default Vehicles

16 vehicles from FF Neusiedl am See:

| ID | Name | Rate | Description |
|----|------|------|-------------|
| kdtfa | KDTFA | 2.01 | Kommando Neusiedl am See |
| rlfa-3000 | RLFA 3000/100 | 2.05 | RüstLösch Neusiedl am See |
| tlfa-4000 | TLFA 4000 | 2.05 | Tank1 Neusiedl am See |
| tb-23-12 | TB 23/12 | 2.06 | Hubsteiger Neusiedl am See |
| srf | SRF | 2.10 | Rüst Neusiedl am See |
| krf-s | KRF-S | 2.02 | Kleinrüst Neusiedl am See |
| mtfa | MTFA | 2.01 | MTF Neusiedl am See |
| vf-sprinter | VF - Sprinter | 2.02 | VF Neusiedl am See |
| vf-kat | VF-KAT | 2.04 | Kat LKW Neusiedl am See |
| wlf-k | WLF-K | 2.10 | Wechselladefahrzeug mit Kran |
| wla-bergung | WLA-Bergung | 2.18 | Bergemulde |
| wla-logistik | WLA-Logistik | 2.17 | Logistik Mulde mit Schadstoffausrüstung |
| oel-anhaenger | Öl Einachsanhänger | 2.13 | - |
| ats-anhaenger | ATS Einachsanhänger | 2.13 | - |
| bootsanhaenger | Bootsanhänger | 2.14 | - |
| oelsperrenanhaenger | Ölsperrenanhänger | 2.14 | Ölsperranhänger |

## UI Design

### Admin UI - Tab Structure

Restructure `KostenersatzAdminSettings.tsx` into 4 tabs:

| Tab | Content |
|-----|---------|
| **Tarife** | Versions section + Rates table + Seed rates button |
| **Fahrzeuge** | Vehicle list with add/edit/delete + Seed vehicles button |
| **Vorlagen** | Shared templates list with edit/delete |
| **E-Mail** | Email configuration form |

### Fahrzeuge Tab

- Table columns: Name, Description, Rate (with rate description), Actions
- Add button: Dialog with Name, Description (optional), Rate dropdown (filtered to categories 2, 4, 8)
- Edit/Delete buttons per row
- "Standard-Fahrzeuge laden" button to seed default vehicles

### Calculation UI - Vehicle Quick-Add Panel

Location: Inside `KostenersatzBerechnungTab.tsx`, above category accordions

```
┌─────────────────────────────────────────────────────────┐
│ Unsere Fahrzeuge                                   [─] │
├─────────────────────────────────────────────────────────┤
│ [KDTFA] [RLFA 3000/100] [TLFA 4000] [TB 23/12]        │
│ [SRF] [KRF-S] [MTFA] [VF-Sprinter] [VF-KAT]           │
│ [WLF-K] [WLA-Bergung] [WLA-Logistik]                   │
│ [Öl Einachsanhänger] [ATS Einachsanhänger]            │
│ [Bootsanhänger] [Ölsperrenanhänger]                    │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Chips for each vehicle
- Selected: filled/primary color; Unselected: outlined
- Click toggles selection:
  - **Select:** Creates line item with vehicle's `rateId`, `einheiten: 1`, uses `defaultStunden`
  - **Deselect:** Removes that line item from `items[]`
- Collapsible accordion
- Syncs with items list (manual delete in items list deselects chip)

### Template Integration

**Saving:**
- Store `vehicles: string[]` alongside existing `items[]`

**Loading:**
1. Clear current items and vehicle selection
2. Set vehicles from template, update panel selection state
3. For each vehicle ID:
   - Look up vehicle in Firestore
   - If found, add line item with vehicle's rateId
   - If deleted, skip silently
4. Add additional non-vehicle items from template

**Template Dialog:**
- Show included vehicles as read-only chips
- Vehicles come from calculation's current selection

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `src/components/Kostenersatz/VehicleQuickAddPanel.tsx` | Quick-add panel component |
| `src/components/Kostenersatz/KostenersatzVehicleTab.tsx` | Admin tab for vehicle management |
| `src/hooks/useKostenersatzVehicles.ts` | Hook for fetching vehicles from Firestore |

### Modified Files

| File | Changes |
|------|---------|
| `src/common/kostenersatz.ts` | Add `KostenersatzVehicle` type, `KOSTENERSATZ_VEHICLES_COLLECTION` constant, update `KostenersatzTemplate` and `KostenersatzCalculation` types |
| `src/common/defaultKostenersatzRates.ts` | Add `DEFAULT_VEHICLES` array |
| `src/components/Kostenersatz/KostenersatzAdminSettings.tsx` | Restructure into 4 tabs using MUI Tabs |
| `src/components/Kostenersatz/KostenersatzBerechnungTab.tsx` | Add `VehicleQuickAddPanel` |
| `src/components/Kostenersatz/KostenersatzTemplateDialog.tsx` | Show vehicle chips, save vehicles to template |
| `src/components/Kostenersatz/KostenersatzTemplateSelector.tsx` | Load vehicles when applying template |
| `src/hooks/useKostenersatzMutations.ts` | Add vehicle CRUD + seed mutations |
