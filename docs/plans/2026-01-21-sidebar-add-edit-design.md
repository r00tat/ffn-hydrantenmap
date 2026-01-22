# Sidebar Add/Edit Functionality Design

## Overview

Enhance the map sidebar to support adding new markers and editing existing ones with a nice categorized UI.

## Requirements

1. Add new markers from the sidebar
2. Edit existing markers in the sidebar
3. Easy selection of different marker types with a nice UI
4. Quick access to Taktische Zeichen (tactical signs) for markers

## Design

### Sidebar Structure

The sidebar has two main sections:

1. **Selected Item Display** (top) - Shows and allows editing the currently selected marker
2. **Add New Item Panel** (below) - Categorized, collapsible UI for creating new items

### Add New Item Panel Layout

```
┌─────────────────────────────┐
│ ▼ Elemente                  │  ← Expanded by default
├─────────────────────────────┤
│    [📍 Marker]              │
│    [🚒 Fahrzeug]            │
│    [💧 Rohr]                │
│    [⭕ Kreis]               │
│    [📐 Fläche]              │
│    [― Leitung]              │
│    ...                      │
├─────────────────────────────┤
│ ▸ Taktische Zeichen         │  ← Collapsed by default
├─────────────────────────────┤
│  ▸ Gefahren                 │
│  ▸ Personen                 │
│  ▸ Schäden                  │
│  ▸ Formation von Kräften    │
│  ▸ Einrichtungen            │
│  ...                        │
└─────────────────────────────┘
```

### Interaction Flows

**Add via Elemente:**
- Click item type → Opens full `FirecallItemDialog` for that type → Place on map

**Add via Taktische Zeichen:**
- Click icon → Creates marker with `zeichen` pre-filled → Opens dialog → Place on map

### Selected Item Display

Enhanced display with more details and actions:

```
┌─────────────────────────────┐
│ [icon] Explosionsgefahr  [X]│  ← Title + close button
│ Tankstelle Hauptstraße      │  ← Name
│ 47.1234, 15.5678            │  ← Coordinates
│                             │
│ [✏️ Edit] [🗑️ Delete]       │  ← Actions
└─────────────────────────────┘
```

Features:
- Close/deselect button (X)
- Delete button with confirmation
- Icon display
- Coordinates display

## Component Structure

### New Components

**`SidebarAddItemPanel.tsx`**
- Accordion panel containing:
  - `Elemente` section: Lists base item types from `fcItemClasses`
  - `Taktische Zeichen` section: Nested accordions for each icon category from `icons.ts`

### Modified Components

**`MapSidebar.tsx`**
- Add `SidebarAddItemPanel` component
- Enhance `FirecallItemDisplay`:
  - Add close button to clear selection
  - Add delete button with confirmation
  - Show icon, coordinates, and more details
- Only show add panel when `editable === true`

**`useMapEditor.ts`**
- Minor: Ensure `openFirecallItemDialog` accepts partial item data (already works via `editFirecallItem`)

## Integration

Both add flows use existing `openFirecallItemDialog()` from `useMapEditor`:

```typescript
// Add vehicle
openFirecallItemDialog({ type: 'vehicle' })

// Add marker with tactical sign
openFirecallItemDialog({ type: 'marker', zeichen: 'Explosionsgefahr' })
```

This reuses the existing dialog and placement logic in `AddFirecallItem.tsx`.

## Implementation Steps

1. Create `SidebarAddItemPanel.tsx` with Elemente accordion
2. Add Taktische Zeichen nested accordions to `SidebarAddItemPanel.tsx`
3. Enhance `FirecallItemDisplay` in `MapSidebar.tsx`:
   - Add close button
   - Add delete button with confirmation
   - Show more item details (icon, coordinates)
4. Integrate `SidebarAddItemPanel` into `MapSidebar.tsx`
5. Test all flows: add via Elemente, add via Taktische Zeichen, edit, delete, close
