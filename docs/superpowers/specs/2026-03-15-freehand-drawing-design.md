# Freehand Drawing Item — Design Spec

**Date:** 2026-03-15
**Branch:** feature/freehand-drawing

---

## Overview

Add a new `drawing` item type to the Einsatzkarte map. Users can draw freehand strokes on the map using mouse or touch, select color and stroke width, undo strokes, and save the completed drawing to Firestore. Saved drawings appear on the map for all users of the same firecall, loaded alongside all other items.

---

## Data Model

### Parent item

Stored in `/call/{firecallId}/item/{itemId}` — identical structure to all other items:

```typescript
interface FirecallDrawingItem extends FirecallItemBase {
  type: 'drawing';
  name: string;          // e.g. "Skizze 1"
  lat: number;           // centroid of all stroke points
  lng: number;           // centroid of all stroke points
  layer?: string;        // optional layer assignment
  zIndex?: number;
  deleted?: boolean;
}
```

### Stroke subcollection

Stored in `/call/{firecallId}/item/{itemId}/stroke/{strokeId}`:

```typescript
interface DrawingStroke {
  color: string;          // hex color, e.g. '#ff0000'
  width: number;          // stroke width in pixels, 1–20
  points: number[][];     // [[lat, lng], ...] — RDP-simplified geo coords
  order: number;          // integer, ascending — determines stroke render order
}
```

Each stroke is its own Firestore document. This avoids large parent documents and keeps individual strokes within Firestore document size limits.

### Firestore rules

The `stroke` subcollection must be covered by the existing Firestore security rules for authorized users of a firecall. Rules must allow read/write on `/call/{firecallId}/item/{itemId}/stroke/{strokeId}`.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/components/FirecallItems/elements/FirecallDrawing.tsx` | `FirecallDrawing` class extending `FirecallItemBase` |
| `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx` | Renders a saved drawing as Leaflet `<Polyline>` elements |
| `src/components/Map/Drawing/DrawingContext.tsx` | Context + provider for in-session drawing state |
| `src/components/Map/Drawing/DrawingCanvas.tsx` | Captures mouse/touch events, manages live preview |
| `src/components/Map/Drawing/DrawingToolbar.tsx` | Floating toolbar UI (color, width, undo, done, cancel) |
| `src/hooks/useDrawingStrokes.ts` | Hook to fetch stroke subcollection for a drawing item |

### Modified files

| File | Change |
|------|--------|
| `src/components/FirecallItems/elements/index.tsx` | Register `drawing` → `FirecallDrawing` in `fcItemClasses` |
| `src/components/Map/AddFirecallItem.tsx` | Activate drawing mode when item type is `drawing` |
| `src/components/Map/Map.tsx` (or map provider) | Add `DrawingProvider` alongside `LeitungenProvider` |
| `firebase/firestore.rules` (dev + prod) | Allow read/write on `stroke` subcollection |

---

## Component Design

### `FirecallDrawing` class

Extends `FirecallItemBase`. Overrides:
- `markerName()` → `'Zeichnung'`
- `fields()` → only `name` (no lat/lng/rotation editing needed)
- `renderMarker()` → returns `<DrawingComponent item={record} />`
- `static isPolyline()` → `false` (drawing mode is activated differently from polyline drawing)

No icon/marker is rendered for the drawing item itself; only strokes are visible.

### `DrawingComponent`

Loads strokes via `useDrawingStrokes(item.id)` and renders each as a React-Leaflet `<Polyline>` with the stroke's `color` and `weight` (width). Strokes rendered in ascending `order`.

### `useDrawingStrokes(itemId)`

Fetches the `stroke` subcollection for the given item ID once on mount using `getDocs` (not `onSnapshot` — drawings don't change after save). Returns `DrawingStroke[]` sorted by `order`.

### `DrawingContext`

Manages in-session state (not persisted until Done):

```typescript
interface DrawingState {
  isDrawing: boolean;
  activeColor: string;
  activeWidth: number;
  strokes: DrawingStroke[];        // buffered, not yet saved
  currentPoints: [number, number][];  // points of stroke in progress
  targetLayer?: string;
  targetItemName: string;
}
```

Actions: `startDrawing`, `addPoint`, `commitStroke`, `undoLastStroke`, `setColor`, `setWidth`, `save`, `cancel`.

### `DrawingCanvas`

- Mounts as an overlay inside the Leaflet map container
- During drawing mode, captures `mousemove`/`touchmove` events throttled to **50ms** intervals
- Converts container pixel coordinates to geo `LatLng` via `map.containerPointToLatLng()`
- Adds point to `currentPoints` in context
- On `mouseup`/`touchend`: runs **Ramer-Douglas-Peucker** simplification with tolerance ~0.00003 degrees (~3m), then calls `commitStroke`
- Renders the current in-progress stroke as a live `<Polyline>` preview

RDP simplification is applied per-stroke before it enters the buffer, keeping point counts low (typically 20–50 points per stroke).

### `DrawingToolbar`

Floating panel, positioned bottom-center of map viewport (CSS fixed, above map controls). Visible only when `isDrawing === true`.

Contents:
- **Color swatches**: 8 preset colors (red, orange, yellow, green, blue, white, black, magenta) + no custom picker (YAGNI)
- **Width presets**: 3 buttons — thin (2px), medium (5px), thick (10px)
- **Undo** button: calls `undoLastStroke`, disabled when `strokes.length === 0`
- **Done** button: calls `save`, disabled when `strokes.length === 0`
- **Cancel** button: calls `cancel`, always enabled

---

## Drawing Flow

1. User opens Add Item dialog, selects type `drawing`, enters a name, selects target layer → clicks OK
2. `AddFirecallItem` detects `type === 'drawing'`, activates `DrawingContext.startDrawing(item)`
3. `DrawingCanvas` intercepts map mouse/touch events
4. User draws strokes; each `mouseup`/`touchend` commits a simplified stroke to the buffer and renders it as a `<Polyline>` preview
5. User can switch color/width between strokes using the toolbar
6. User can undo the last stroke (removes last entry from buffer)
7. User clicks **Done**:
   - Compute centroid of all points across all strokes → `lat`/`lng` for parent item
   - Write parent item document to Firestore
   - Batch-write all stroke documents to the `stroke` subcollection
   - Exit drawing mode
8. The new drawing item appears in the items collection listener → `DrawingComponent` mounts, fetches strokes, renders

---

## Not In Scope

- Editing or moving a saved drawing
- Per-stroke color/width changes after save
- Live collaborative drawing (strokes visible to others during drawing)
- Pixel-level eraser (undo-last-stroke covers this use case)
- Custom color picker (8 presets are sufficient for field use)
- Exporting drawings as images

---

## Open Questions

None — all decisions confirmed with user.
