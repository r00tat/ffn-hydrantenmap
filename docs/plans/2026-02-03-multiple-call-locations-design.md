# Multiple Call Locations (Einsatzorte) Design

## Overview

A new feature enabling users to store and manage multiple locations per firecall, replacing the spreadsheet-based Unwetter system with Firestore-based storage and inline editing.

## Requirements

1. Store multiple locations per firecall in Firestore
2. Dedicated "Einsatzorte" tab with editable table
3. Responsive layout: table on desktop, cards on mobile
4. Debounced auto-save (500ms) without save button
5. Always-present empty row for adding new entries
6. Delete button per row
7. Map picker and manual coordinate entry
8. Automatic geocoding when street + number are filled
9. Color-coded markers on map by status
10. Clean break from spreadsheet system (no migration)

## Data Model

**Collection:** `/call/{firecallId}/location/`

```typescript
interface FirecallLocation {
  id?: string;

  // Address
  street: string;
  number: string;
  city: string;           // default: "Neusiedl am See"

  // Details
  name: string;           // Bezeichnung/title
  description: string;    // Status lang
  info: string;           // Info/Alarm notes

  // Status (dropdown)
  status: 'offen' | 'einsatz notwendig' | 'in arbeit' | 'erledigt' | 'kein einsatz';
  vehicles: string;       // Comma-separated, e.g., "LF, TLF, MTF"

  // Times
  alarmTime?: string;     // Alarmzeit
  startTime?: string;     // Start
  doneTime?: string;      // Erledigt um

  // Coordinates
  lat?: number;
  lng?: number;

  // Metadata
  created: string;
  creator: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

**Status values and map colors:**
- `offen` → yellow
- `einsatz notwendig` → red
- `in arbeit` → orange
- `erledigt` → green
- `kein einsatz` → green

## UI Design

### Desktop View (≥768px): Table Layout

| Column | Field | Flex | Input Type |
|--------|-------|------|------------|
| Status | status | 0 0 auto | Dropdown (color-coded chip) |
| Bezeichnung | name | 1 | Text |
| Adresse | street, number, city | 1.5 | Combined text fields |
| Fahrzeuge | vehicles | 1 | Text |
| Zeiten | alarmTime, startTime, doneTime | 0 0 auto | Time pickers (compact) |
| Koordinaten | lat/lng | 0 0 auto | Text + map picker button |
| | | 0 0 40px | Delete button |

Description and Info shown in expandable row or tooltip.

### Mobile View (<768px): Card Layout

```
┌─────────────────────────────┐
│ [Status Chip]     [Delete]  │
│ Bezeichnung (name)          │
│ Straße Nr., Ort             │
│ Fahrzeuge: LF, TLF          │
│ ─────────────────────────── │
│ Alarmiert: 14:30            │
│ Start: 14:45  Erledigt: --  │
│ ─────────────────────────── │
│ Beschreibung text...        │
│ [📍 Set Location]           │
└─────────────────────────────┘
```

Each card is fully editable inline – tap a field to edit, debounced auto-save.

### Interaction Patterns

**Adding locations:**
- Last row/card is always empty (placeholder for new entry)
- Typing in empty row creates the document
- New empty row appears below automatically

**Editing:**
- All fields editable inline
- Debounced auto-save after 500ms of no typing
- Optimistic UI updates with rollback on error

**Deleting:**
- Delete button (trash icon) per row/card
- Immediate deletion, no confirmation dialog

**Geocoding:**
- Triggered when street AND number both have values
- Debounced (waits for typing to stop)
- Only updates coordinates if currently empty or address was changed
- Silent fail on geocoding error (user can set manually)

**Map picker:**
- Button opens modal with map
- Click on map sets lat/lng
- Shows current marker position if coordinates exist
- Confirm/Cancel buttons

## Map Integration

### LocationsLayer Component

New map layer replacing `UnwetterLayer`:
- Subscribes to `/call/{firecallId}/location/` collection
- Renders color-coded markers by status
- Marker popup shows: name, address, status, vehicles, description
- Non-draggable markers (edit via Einsatzorte tab)

## Component Architecture

### New Files

```
src/
├── app/
│   └── einsatzorte/
│       └── page.tsx                    # Main page
├── components/
│   ├── Einsatzorte/
│   │   ├── EinsatzorteTable.tsx        # Desktop table view
│   │   ├── EinsatzorteCard.tsx         # Mobile card view
│   │   ├── EinsatzorteRow.tsx          # Single table row
│   │   ├── LocationMapPicker.tsx       # Map coordinate picker modal
│   │   └── StatusChip.tsx              # Color-coded status dropdown
│   └── Map/
│       └── layers/
│           └── LocationsLayer.tsx      # Map markers for locations
├── hooks/
│   └── useFirecallLocations.ts         # Data hook with CRUD operations
└── components/firebase/
    └── firestore.ts                    # Add FirecallLocation interface
```

### Data Hook: useFirecallLocations

```typescript
function useFirecallLocations(): {
  locations: FirecallLocation[];
  loading: boolean;
  addLocation: (location: Partial<FirecallLocation>) => Promise<string>;
  updateLocation: (id: string, updates: Partial<FirecallLocation>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
}
```

- Subscribes to collection with real-time updates
- Returns sorted by creation time (newest last)
- Handles Firestore operations

### Auto-Save Logic

```typescript
// Per-row state tracks pending changes
const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<FirecallLocation>>>({});

// Debounced save effect
useEffect(() => {
  const timer = setTimeout(() => {
    Object.entries(pendingChanges).forEach(([id, changes]) => {
      if (id === 'new') {
        addLocation(changes);
      } else {
        updateLocation(id, changes);
      }
    });
    setPendingChanges({});
  }, 500);
  return () => clearTimeout(timer);
}, [pendingChanges]);
```

## Navigation

- Add "Einsatzorte" to main navigation alongside Einsatztagebuch, Geschäftsbuch
- Tab visible when a firecall is selected

## Error Handling

- Network errors during save → show snackbar with retry option
- Geocoding failures → silent fail, leave coordinates empty
- Optimistic UI updates with rollback on error

## Migration

Clean break from spreadsheet system:
- `UnwetterLayer` and spreadsheet code can be removed or left dormant
- No import/migration feature needed
- New firecalls use Firestore-based locations exclusively

## Implementation Steps

1. Add `FirecallLocation` interface to `firestore.ts`
2. Create `useFirecallLocations` hook
3. Create `StatusChip` component
4. Create `LocationMapPicker` modal component
5. Create `EinsatzorteRow` component with inline editing
6. Create `EinsatzorteTable` component (desktop)
7. Create `EinsatzorteCard` component (mobile)
8. Create `einsatzorte/page.tsx` with responsive layout
9. Create `LocationsLayer` map component
10. Add navigation entry for Einsatzorte tab
11. Integrate geocoding on address change
12. Remove or deprecate `UnwetterLayer` and spreadsheet code
