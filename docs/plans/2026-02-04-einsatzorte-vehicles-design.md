# Einsatzorte Vehicle Selection Feature Design

## Overview

Replace the free-text `vehicles` field in Einsatzorte with a structured autocomplete that suggests vehicles from Kostenersatz and other Einsatzorte in the current firecall. When a Kostenersatz vehicle is selected, it automatically creates or updates the corresponding vehicle item in the firecall.

## Data Model Changes

### FirecallLocation Type

```typescript
// In src/components/firebase/firestore.ts
export interface FirecallLocation {
  // ... existing fields ...
  vehicles: string[];  // Changed from string to string[]
  // ...
}
```

### Migration Strategy

Handle legacy string values on read in `useFirecallLocations`:

```typescript
const migrateVehicles = (vehicles: string | string[] | undefined): string[] => {
  if (!vehicles) return [];
  if (Array.isArray(vehicles)) return vehicles;
  // Legacy string: split by comma, trim, filter empty
  return vehicles.split(',').map(v => v.trim()).filter(Boolean);
};
```

No Firestore schema migration required - conversion happens at read time.

## Vehicle Suggestion Sources

1. **Kostenersatz vehicles** - Predefined fleet from `useKostenersatzVehicles` hook (e.g., "RLFA 3000/100", "KDTFA", etc.)
2. **Firecall vehicles** - Custom vehicles already entered in other Einsatzorte within the same firecall (deduped)

## UI Components

### New: VehicleAutocomplete

Location: `src/components/Einsatzorte/VehicleAutocomplete.tsx`

```typescript
interface VehicleAutocompleteProps {
  value: string[];
  onChange: (vehicles: string[]) => void;
  suggestions: string[];  // Combined Kostenersatz + firecall vehicles
  kostenersatzVehicleNames: Set<string>;  // To identify Kostenersatz vehicles
  disabled?: boolean;
  onKostenersatzVehicleAdded?: (vehicleName: string) => void;
}
```

Features:
- MUI `Autocomplete` with `multiple` and `freeSolo` props
- Selected vehicles displayed as deletable `Chip` components
- Typing filters suggestions
- Free text allowed for external vehicles
- Callback when Kostenersatz vehicle is added (triggers firecall item creation)

### New: useVehicleSuggestions Hook

Location: `src/hooks/useVehicleSuggestions.ts`

```typescript
interface UseVehicleSuggestionsResult {
  suggestions: string[];
  kostenersatzVehicleNames: Set<string>;
  loading: boolean;
}

function useVehicleSuggestions(locations: FirecallLocation[]): UseVehicleSuggestionsResult {
  const { vehicles: kostenersatzVehicles } = useKostenersatzVehicles();

  // Combine:
  // 1. Kostenersatz vehicle names
  // 2. All unique vehicles from current firecall locations
  // Dedupe and sort
}
```

## Desktop Table Integration (EinsatzorteRow)

### Collapsed State

- Display selected vehicles as compact text or small chips
- Empty state: "—" or subtle placeholder
- Click on cell to expand

### Expanded State

- Row expands to show `VehicleAutocomplete` below main row content
- Full-width autocomplete input with chips
- Click outside or toggle button to collapse

```
┌─────────────────────────────────────────────────────────┐
│ Status │ Straße │ ... │ Fahrzeuge (▼) │ Zeiten │ Actions │
├─────────────────────────────────────────────────────────┤
│ (expanded section spanning full width)                  │
│ [RLFA 3000/100 ✕] [KDTFA ✕] [____________🔍]           │
└─────────────────────────────────────────────────────────┘
```

## Mobile Card Integration (EinsatzorteCard)

Vehicle selection always visible (no expansion):

```
┌─────────────────────────────────┐
│ [Status Chip]        [Actions ⋮]│
│                                 │
│ Straße, Hausnummer              │
│ Stadt                           │
│ Beschreibung...                 │
│                                 │
│ Fahrzeuge:                      │
│ [RLFA ✕] [KDTFA ✕] [_______🔍] │
│                                 │
│ Alarmzeit: 14:32                │
│ Startzeit: 14:45                │
└─────────────────────────────────┘
```

## Kostenersatz Vehicle Auto-Add Behavior

### When User Selects a Kostenersatz Vehicle

1. Add vehicle name to `location.vehicles[]` array
2. Check if vehicle item already exists in firecall items (by name match)
3. **If vehicle item is new:**
   - Create vehicle item in firecall
   - Set position to Einsatzort coordinates
   - Fallback: use firecall position if Einsatzort has no coordinates
4. **If vehicle item exists:**
   - Create history checkpoint (captures current state with timestamp)
   - Update vehicle item position to Einsatzort coordinates

### When User Removes a Vehicle from Einsatzort

- Only remove from `location.vehicles[]` array
- Vehicle item in firecall remains unchanged
- Position is preserved (vehicle doesn't leave the scene, just this specific location)

### When User Enters Free-Text Vehicle

- Only add to `location.vehicles[]` array
- No firecall item created (external vehicles aren't tracked as items)

## Files to Modify

### New Files

| File | Purpose |
|------|---------|
| `src/components/Einsatzorte/VehicleAutocomplete.tsx` | Autocomplete component with chips |
| `src/hooks/useVehicleSuggestions.ts` | Combines Kostenersatz + firecall vehicle suggestions |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/firebase/firestore.ts` | Change `vehicles: string` to `vehicles: string[]` |
| `src/hooks/useFirecallLocations.ts` | Add migration logic for legacy string values |
| `src/components/Einsatzorte/EinsatzorteRow.tsx` | Add expandable vehicle section with autocomplete |
| `src/components/Einsatzorte/EinsatzorteCard.tsx` | Add always-visible vehicle autocomplete |
| `src/components/Einsatzorte/EinsatzorteTable.tsx` | Column width adjustments if needed |

## Integration Points

- `useKostenersatzVehicles` - Source for predefined vehicles
- `useFirecallItems` or similar - For creating/updating vehicle items in firecall
- History system - For creating checkpoints before vehicle moves
