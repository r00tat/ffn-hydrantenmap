# Sidebar Inline Editing Design

## Overview

Extend the map sidebar to support inline editing of selected firecall items. Clicking anywhere on the item card enters edit mode, transforming the display into an editable form with all fields from the dialog. Enter saves, Escape cancels.

## Requirements

1. Click anywhere on the selected item card to enter edit mode
2. Display all fields from `FirecallItemDialog` inline in the sidebar
3. Save with Enter key, cancel with Escape key
4. Show MUI Snackbar confirmation on save
5. Click outside card cancels edit mode

## Interaction Flow

```
┌─────────────────────────────────┐
│ Display Mode (current)          │
│ ┌─────────────────────────────┐ │
│ │ [icon] Vehicle Name      [X]│ │  ← Click anywhere on card
│ │ Fahrzeug                    │ │    to enter edit mode
│ │ Description text...         │ │
│ │ 47.123, 15.567              │ │
│ │ [Edit] [Delete]             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
         │ click
         ▼
┌─────────────────────────────────┐
│ Edit Mode                       │
│ ┌─────────────────────────────┐ │
│ │ [icon] [Name TextField___]  │ │  ← Title becomes editable
│ │                             │ │
│ │ [Beschreibung TextField ]   │ │  ← All fields from dialog
│ │ [Datum Picker            ]  │ │    appear inline
│ │ [Taktisches Zeichen ▼    ]  │ │
│ │ [Ebene ▼                 ]  │ │
│ │ ... (more fields)           │ │
│ │                             │ │
│ │ Enter=Speichern Esc=Abbr.   │ │  ← Hint text
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
         │ Enter
         ▼
┌─────────────────────────────────┐
│ Display Mode + Snackbar         │
│ ┌─────────────────────────────┐ │
│ │ (back to normal display)    │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ Gespeichert               │ │  ← Snackbar auto-hides
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Component Structure

### New Component: `FirecallItemFields.tsx`

Shared field rendering component extracted from `FirecallItemDialog`:

```typescript
interface FirecallItemFieldsProps {
  item: FirecallItemBase;
  setItemField: (field: string, value: any) => void;
  showLatLng?: boolean;      // Show lat/lng fields (default: true for existing items)
  showLayerSelect?: boolean; // Show layer selector (default: true)
}
```

Renders all field types based on `item.fields()` and `item.fieldTypes()`:

| Field Type | Component |
|------------|-----------|
| `text` (default) | `TextField` |
| `textarea` | `TextField` multiline |
| `number` | `TextField` type="number" |
| `boolean` | `Switch` with `FormControlLabel` |
| `date` | `MyDateTimePicker` |
| `TaktischesZeichen` | `Select` with icon groups |
| `select` | `Select` with options |
| `color` | `MuiColorInput` |
| `attachment` | `FileUploader` + `FileDisplay` |

### Modified: `FirecallItemDisplay` in `MapSidebar.tsx`

```
FirecallItemDisplay
├── State
│   ├── isEditing: boolean
│   ├── editedItem: FirecallItemBase (local copy for editing)
│   └── snackbarOpen: boolean
│
├── Display Mode (isEditing = false)
│   ├── Existing Card layout
│   ├── onClick → enter edit mode
│   └── Edit/Delete buttons
│
├── Edit Mode (isEditing = true)
│   ├── Card with FirecallItemFields
│   ├── onKeyDown handler (Enter → save, Escape → cancel)
│   ├── onClickOutside → cancel
│   └── Hint text: "Enter = Speichern · Escape = Abbrechen"
│
└── Snackbar
    └── "Gespeichert" message, auto-hide 3s
```

### Modified: `FirecallItemDialog.tsx`

Refactor to use the shared `FirecallItemFields` component instead of inline field rendering.

## Behaviors

### Entering Edit Mode
- Click anywhere on the card content
- Or click the Edit button
- Creates local copy of item in `editedItem` state

### Saving (Enter)
1. Call `updateItem(editedItem.filteredData())`
2. Call `selectFirecallItem(editedItem.filteredData())`
3. Show Snackbar "Gespeichert"
4. Exit edit mode

### Canceling (Escape)
1. Discard `editedItem` changes
2. Exit edit mode
3. No snackbar

### Click Outside
- Treat as cancel (discard changes, exit edit mode)

### Delete While Editing
- Show confirm dialog
- If confirmed: delete item, clear selection, exit edit mode

### Close (X) While Editing
- Cancel changes
- Clear selection

## Visual Design

### Edit Mode Indicators
- Subtle border change (e.g., primary color border)
- Hint text at bottom: "Enter = Speichern · Escape = Abbrechen"

### Snackbar
- Message: "Gespeichert"
- Duration: 3 seconds
- Position: bottom-right (sidebar is on right, so snackbar appears near it)

## Implementation Steps

1. **Create `FirecallItemFields.tsx`**
   - Extract field rendering logic from `FirecallItemDialog`
   - Accept `item`, `setItemField`, and layout props
   - Handle all field types

2. **Refactor `FirecallItemDialog.tsx`**
   - Import and use `FirecallItemFields`
   - Keep dialog structure (title, actions)

3. **Update `FirecallItemDisplay` in `MapSidebar.tsx`**
   - Add editing state management
   - Add click handler to enter edit mode
   - Render `FirecallItemFields` when editing
   - Add keyboard event listeners
   - Add click-outside detection
   - Add Snackbar component

4. **Test all item types**
   - Marker, Vehicle, Rohr, Circle, Area, Line, Diary
   - Verify all field types render and save correctly
