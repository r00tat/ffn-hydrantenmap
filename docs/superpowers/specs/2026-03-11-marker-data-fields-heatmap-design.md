# Marker Data Fields & Heatmap Visualization

**Date:** 2026-03-11
**Branch:** feature/object-ordering
**Status:** Draft

## Overview

Add a user-defined data field system to layers and point markers, enabling structured key-value data collection (e.g., gas measurements, sensor readings) with heatmap visualization. Layer-level schema definitions control which fields appear on each marker. Marker colors and a Leaflet heatmap overlay visualize values for a selected field.

## Goals

- Allow users to define custom data fields (Datenfelder) per layer with label, key, unit, data type, and default value
- Store structured key-value data on point markers as native Firestore objects
- Color markers based on a selected data field value (green-yellow-red gradient)
- Provide a toggleable Leaflet heatmap overlay layer
- Auto-generate data schemas from KML ExtendedData on import
- Maintain KML ExtendedData compatibility for future export

## Non-Goals

- Data fields on non-point items (areas, lines, circles) — deferred to a later phase
- KML export
- Historical value tracking (time series per marker)
- Cross-layer heatmap aggregation

## Data Model

### DataSchemaField

Defines a single data field on a layer. Stored as a native Firestore array on `FirecallLayer.dataSchema`.

```typescript
interface DataSchemaField {
  key: string;                              // unique identifier, e.g. "o2"
  label: string;                            // display name, e.g. "O2"
  unit: string;                             // e.g. "%", "ppm", "°C"
  type: 'number' | 'text' | 'boolean';     // data type
  defaultValue?: string | number | boolean; // pre-filled for new items
}
```

### HeatmapConfig

Controls heatmap visualization for a layer. Stored as a native Firestore object on `FirecallLayer.heatmapConfig`.

```typescript
interface HeatmapConfig {
  enabled: boolean;
  activeKey: string;                        // which dataSchema key drives coloring
  colorMode: 'auto' | 'manual';
  // manual mode fields (ignored when colorMode === 'auto')
  min?: number;
  max?: number;
  colorStops?: { value: number; color: string }[];
}
```

### FirecallLayer changes

```typescript
interface FirecallLayer {
  // ...existing fields
  dataSchema?: DataSchemaField[];
  heatmapConfig?: HeatmapConfig;
}
```

### FirecallItem changes

```typescript
interface FirecallItem {
  // ...existing fields
  fieldData?: Record<string, string | number | boolean>;
}
```

The field is named `fieldData` (not `data`) to avoid collision with the existing `data()` method on `FirecallItemBase` which serializes the object for Firestore.

All three new fields are stored as native Firestore objects/arrays (not JSON strings). This enables querying on individual data keys (e.g., `where('fieldData.o2', '>', 18)`) and avoids serialize/deserialize overhead.

### Implementation notes

- **`filteredData()` fix**: The existing `FirecallItemBase.filteredData()` method strips falsy values. The filter should be replaced with `value !== undefined && value !== null && value !== ''` to correctly preserve `false` booleans, `0` numbers, and `fieldData` objects.
- **`FirecallItemBase` plumbing**: `fieldData` must be added to `FirecallItemBase`'s constructor destructuring, stored as an instance property, and included in the `data()` serialization output — same pattern as other fields like `layer`, `rotation`, etc.
- **`FirecallItemLayer` plumbing**: The `FirecallItemLayer` class explicitly enumerates fields in its constructor, instance properties, and `data()` method. Both new properties (`dataSchema`, `heatmapConfig`) must be added to the constructor, stored as instance properties, and included in the `data()` serialization output.
- **Schema editor integration**: The schema editor and heatmap settings are custom components rendered in `FirecallItemDialog` when `item.type === 'layer'` — they do not use the `fields()`/`fieldTypes()` pattern, which only supports simple field types.
- **Dialog access to layer schema**: `FirecallItemDialog` accesses the parent layer's `dataSchema` via `useFirecallLayers()` hook, looking up by `item.layer`. This hook already returns full `FirecallLayer` objects including the new fields.

## UI: Layer Schema Editor

When editing a layer (`type === 'layer'`) in `FirecallItemDialog`, a new **"Datenfelder"** (Data Fields) section appears.

### Schema field list

A dynamic list where each row contains:

- **Label** — display name (TextField)
- **Key** — auto-slugified from label (e.g., "O2 Gehalt" -> "o2_gehalt"), editable, must be unique within the schema (TextField)
- **Unit** — e.g., "%", "ppm", "°C" (TextField)
- **Type** — dropdown: number, text, boolean (Select)
- **Default Value** — input matching the selected type (TextField / Checkbox)
- **Delete** button per row

An **"Add field"** button appends a new empty row. Fields can be reordered via up/down buttons.

### Heatmap settings

Below the schema editor, a **"Heatmap"** section:

- **Enable heatmap coloring** toggle (Switch)
- When enabled:
  - **Active key** dropdown — filtered to `type: 'number'` fields only
  - **Color mode** toggle: Auto / Manual
  - When manual:
    - **Min** and **Max** number inputs
    - **Color stops** list: value (number) + color (color picker), with add/remove

## UI: Item Data Entry

When editing a point marker that belongs to a layer with `dataSchema`, an additional **"Daten"** (Data) section appears in `FirecallItemDialog`, below the standard fields.

For each `DataSchemaField`:

- `number` — `TextField` with `type="number"`, label: `{label} ({unit})`
- `text` — `TextField`, label: `{label} ({unit})` if unit is set, otherwise just `{label}`
- `boolean` — `Checkbox` with label

New items are pre-filled with `defaultValue` from the schema. Values are read from and written to `item.fieldData[key]`.

If the marker has no layer, or the layer has no `dataSchema`, this section is hidden.

### Map popup display

The marker popup on the map displays data values in compact format:

```text
O2: 19.5% | CO: 12 ppm | Temp: 28.3°C
```

Showing label, value, and unit inline. Only fields with a value are shown.

## Marker Coloring

When a layer has `heatmapConfig.enabled === true` and an `activeKey` selected, marker icon colors are overridden based on their `fieldData[activeKey]` value.

### Color scale

- **Auto mode**: Scans all markers in the layer to determine min/max for the active key. Maps values linearly to a green (low) -> yellow (mid) -> red (high) gradient. Note: for measurements where low values are dangerous (e.g., O2), users should use manual mode to invert the scale direction.
- **Manual mode**: Uses configured `min`, `max`, and `colorStops` for the gradient. Supports inverted scales by setting color stops in any order.
- **No data**: Markers without a value for the active key render in grey.

### Implementation

A utility function `getHeatmapColor(value, config, allValues)` returns a hex color string. Called during marker rendering — the existing `/api/icons/marker?fill={color}` endpoint accepts a fill color, so the icon pipeline stays unchanged.

### Legend

A small color scale legend appears on the map when heatmap coloring is active, showing:

- The gradient bar
- Min/max labels with unit
- The active field name

## Heatmap Overlay

A toggleable Leaflet heatmap overlay layer using the `leaflet.heat` npm package (`leaflet.heat@^0.2.0`). Since this is a Next.js app, the component must be dynamically imported client-side only (`'use client'` + `next/dynamic` with `ssr: false`), consistent with how other Leaflet components are loaded in this codebase. The package has no TypeScript types — a local `.d.ts` declaration file will be needed (similar to the existing `mabox-togeojson.d.ts` pattern).

### Behavior

- Appears as a separate entry in Leaflet's `LayersControl`: `"{Layer name} Heatmap"`
- User can show markers only, heatmap only, or both simultaneously
- Each point marker with a numeric value for the active key contributes its value as intensity at its lat/lng
- Markers without a value are excluded

### Configuration

Reuses the same `heatmapConfig` from the layer (activeKey, colorMode, min/max). Auto mode normalizes intensities the same way as marker coloring.

## KML Import Adjustments

The existing `KmlImport` component (`src/components/firebase/KmlImport.tsx`) currently places KML ExtendedData properties into the `beschreibung` field as concatenated text.

### New behavior

On import:

1. Parse KML properties from `f.properties` as before
2. Auto-generate a `dataSchema` from the **union** of all KML properties across all features in the file:
   - Numeric-looking values -> `type: 'number'`
   - `"true"` / `"false"` -> `type: 'boolean'`
   - Everything else -> `type: 'text'`
   - Property name used as both `key` and `label`
   - Unit left empty (user can edit later)
   - If a property appears with different inferred types across features, fall back to `'text'`
3. Store all property values in `item.fieldData` (coerced to the inferred type)
4. Nothing goes to `beschreibung` from ExtendedData properties
5. Save the auto-generated schema to the newly created layer by passing `dataSchema` to `addFirecallItem` when creating the layer (not as a separate update)

The auto-generated schema makes imported data immediately usable for heatmap visualization. Users can refine labels, units, and heatmap settings after import.

### Excluded properties

Properties that are KML styling metadata (not user data) are excluded from the schema: `styleUrl`, `styleHash`, `stroke`, `stroke-opacity`, `stroke-width`, `fill`, `fill-opacity`, `visibility`, `icon`.

## Affected Files

| File | Change |
| ------ | -------- |
| `src/components/firebase/firestore.ts` | Add `DataSchemaField`, `HeatmapConfig` types; add `dataSchema`, `heatmapConfig` to `FirecallLayer`; add `fieldData` to `FirecallItem` |
| `src/components/FirecallItems/elements/FirecallItemLayer.tsx` | Add `dataSchema`, `heatmapConfig` to constructor, instance properties, and `data()` serialization |
| `src/components/FirecallItems/elements/FirecallItemBase.tsx` | Add `fieldData` field handling; fix `filteredData()` to preserve `boolean` `false` values |
| `src/components/FirecallItems/FirecallItemDialog.tsx` | Render custom `DataSchemaEditor` for layers; render `ItemDataFields` for items via `useFirecallLayers()` lookup |
| `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx` | Override marker color when heatmap coloring active |
| `src/components/FirecallItems/elements/FirecallItemMarker.tsx` | Pass heatmap color to icon rendering |
| `src/components/Map/layers/FirecallLayer.tsx` | Add heatmap overlay layer per layer with enabled config |
| `src/components/Map/layers/FirecallItemsLayer.tsx` | Pass heatmap config to marker rendering |
| `src/components/firebase/KmlImport.tsx` | Auto-generate schema, store data in `item.fieldData` instead of `beschreibung` |
| New: `src/common/heatmap.ts` | `getHeatmapColor()` utility, color interpolation logic |
| New: `src/components/Map/HeatmapLegend.tsx` | Color scale legend component |
| New: `src/components/FirecallItems/DataSchemaEditor.tsx` | Schema editor component for layer dialog |
| New: `src/components/FirecallItems/ItemDataFields.tsx` | Data entry fields component for item dialog |
| New: `src/components/Map/layers/HeatmapOverlay.tsx` | Leaflet.heat overlay component |

## Edge Cases

- **Schema field deleted**: Removing a field from the `dataSchema` hides it from the UI but does not delete existing values from items. Orphaned data remains in Firestore and reappears if a field with the same key is re-added. If `heatmapConfig.activeKey` references a deleted field, all markers render grey (no data).
- **Schema field type changed**: Existing values are displayed as-is. No retroactive coercion is performed on existing items when a field's type changes. The edit dialog uses the new type for future edits.
- **Active heatmap key has no values**: If no markers have a numeric value for the active key, auto mode shows no coloring (all markers grey). The legend shows "No data".
- **Auto mode with all identical values**: When all markers have the same value (min === max), all markers render with the midpoint color (yellow) to avoid division by zero.
- **Manual mode with missing config**: If manual mode is selected but `min`, `max`, or `colorStops` are not configured, fall back to auto mode behavior.
- **Concurrent schema edits**: If two users edit the same layer's `dataSchema` simultaneously, the last write wins. This is an accepted limitation consistent with other Firestore fields in the app.
- **Popup display**: The map popup shows `fieldData` values only when the item's layer has a `dataSchema`. If no schema exists, `fieldData` is not displayed in the popup.

## Scope

- **In scope**: Point markers only
- **Deferred**: Data fields on areas, lines, circles; KML export; time-series tracking
