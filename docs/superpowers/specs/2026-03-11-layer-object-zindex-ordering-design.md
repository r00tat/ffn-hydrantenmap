# Layer & Object Z-Index Ordering

## Problem

Map objects render in Firestore creation order with no user control over visual stacking. Overlapping items (areas, markers, polygons) cannot be reordered. Layers have no rendering priority relative to each other.

## Solution

Add a numeric `zIndex` field to control rendering order at two levels:

1. **Layer level** — layers with higher `zIndex` render on top of layers with lower `zIndex`
2. **Item level** — items within the same layer with higher `zIndex` render on top of siblings

## Data Model

Add `zIndex?: number` to the `FirecallItem` interface (which `FirecallLayer` extends).

- Existing items without `zIndex` default to `0`.
- New items/layers get `max(existing zIndex values in scope) + 1`, so they appear on top by default.
- Scope for items = siblings in the same layer. Scope for layers = all layers in the firecall.
- **Tie-breaking**: When multiple items share the same `zIndex`, secondary sort by `datum` ascending (creation timestamp). This provides deterministic ordering for existing items that all start at `0`.

No Firestore index changes needed — ordering is done client-side.

## Map Rendering (Leaflet)

### Layer-level z-index

In `FirecallLayer.tsx`:

- Sort layers by `zIndex` ascending before rendering.
- Use React Leaflet's `<Pane>` component to create a custom pane per layer with CSS z-index = `400 + layer.zIndex`. This ensures all items in a higher-zIndex layer render above all items in a lower-zIndex layer.
- The default/unassigned layer gets pane z-index `400 + 0`, so named layers render above it by default.

### Item-level z-index within a layer

In `FirecallItemsLayer.tsx`:

- Sort items by `zIndex` ascending (with `datum` as tiebreaker) before rendering.
- **Markers**: Pass `item.zIndex` as `zIndexOffset` to Leaflet markers. Leaflet natively supports this for stacking markers.
- **Vector items** (areas, lines, circles): Rendered within their layer's pane. Since vectors in the same pane render in DOM order, the sort order controls visual stacking.

### Pane propagation to renderers

The `pane` name must flow from the layer level down to every Leaflet element. This requires:

- Add `pane?: string` to `MarkerRenderOptions` in `FirecallItemDefault.tsx`.
- Thread `pane` through `renderMarker()` on `FirecallItemBase` and all subclasses that override it.
- Pass `pane` to every Leaflet component: `RotatedMarker`, `Polygon`, `Polyline`, `Circle`, `Marker` in:
  - `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx`
  - `src/components/FirecallItems/elements/area/AreaComponent.tsx`
  - `src/components/FirecallItems/elements/CircleMarker.tsx`
  - `src/components/FirecallItems/elements/connection/ConnectionComponent.tsx`
  - `src/components/FirecallItems/elements/FirecallLine.tsx`

## Item Detail Dialog (z-index controls)

In `FirecallItemDialog.tsx`, add four icon buttons in `DialogActions` (only for existing items):

| Button | Icon | Action |
|---|---|---|
| Send to Back | VerticalAlignBottom | `zIndex = min(siblings) - 1` |
| Send Backward | ArrowDownward | Swap `zIndex` with the next lower item (by sorted position including tiebreaker) |
| Bring Forward | ArrowUpward | Swap `zIndex` with the next higher item (by sorted position including tiebreaker) |
| Bring to Front | VerticalAlignTop | `zIndex = max(siblings) + 1` |

"Siblings" = items in the same layer. When items share the same `zIndex` and there is no distinct "next" item, the button assigns `currentZIndex + 1` or `currentZIndex - 1` to differentiate.

### Save behavior

The z-order buttons write directly to Firestore using `useFirecallItemUpdate` (adding it to the dialog) and update local state without closing the dialog. This is a targeted addition to the dialog's contract — the existing Save/Cancel/Delete flow is unchanged.

Buttons are grouped on the left side of `DialogActions`, visually separated from Save/Delete/Copy.

## Layers Page (drag-and-drop reordering)

In `Layers.tsx`:

- Sort layer cards by `zIndex` descending (highest = top of list = renders on top of map).
- Add drag-and-drop reordering using `@dnd-kit/sortable` (already installed) with `SortableContext` and `useSortable` on layer cards.
- On drag end, recalculate `zIndex` values for all layers based on new positions (renumber 0…N-1 to keep values contiguous) and batch-update Firestore.

### Drag disambiguation

Two drag behaviors coexist on the same page:

1. Drag a **layer card** up/down to reorder layers (changes `zIndex`)
2. Drag an **item card** onto a layer to reassign it (existing behavior)

To distinguish them, attach `data: { type: 'layer' }` to layer sortable registrations and `data: { type: 'item' }` to item draggable registrations. In `handleDragEnd`, inspect `event.active.data.current?.type`:

- If `'layer'` → execute layer reorder logic
- If `'item'` → execute existing item reassignment logic

Items within layers continue to sort by `datum` on this page.

## `useFirecallLayers` hook

Currently returns `SimpleMap<FirecallLayer>` (object keyed by ID). Add a companion return value: a sorted array of layers ordered by `zIndex` ascending. Callers that need ordered iteration (map rendering, Layers page) use the array. Callers that need lookup by ID use the map. Both are returned from the hook.

## Files to Modify

| File | Changes |
|---|---|
| `src/components/firebase/firestore.ts` | Add `zIndex?: number` to `FirecallItem` |
| `src/components/FirecallItems/elements/FirecallItemBase.tsx` | Add `zIndex` to constructor, `data()`, `copy()` |
| `src/components/Map/layers/FirecallLayer.tsx` | Sort layers by zIndex, wrap each in `<Pane>` |
| `src/components/Map/layers/FirecallItemsLayer.tsx` | Sort items by zIndex, pass pane + zIndexOffset |
| `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx` | Add `pane` to `MarkerRenderOptions`, apply to `RotatedMarker` |
| `src/components/FirecallItems/elements/area/AreaComponent.tsx` | Accept and pass `pane` to `Polygon` / `Marker` |
| `src/components/FirecallItems/elements/CircleMarker.tsx` | Accept and pass `pane` to `Circle` |
| `src/components/FirecallItems/elements/connection/ConnectionComponent.tsx` | Accept and pass `pane` to `Polyline` |
| `src/components/FirecallItems/elements/FirecallLine.tsx` | Accept and pass `pane` to `Polyline` |
| `src/components/FirecallItems/FirecallItemDialog.tsx` | Add z-order buttons with direct Firestore write |
| `src/components/pages/Layers.tsx` | Sort layers by zIndex, add sortable drag-and-drop with disambiguation |
| `src/hooks/useFirecallLayers.ts` | Return sorted array alongside existing map |

## Backward Compatibility

Fully backward compatible. Existing items without `zIndex` default to `0` and maintain their current relative order (tiebroken by `datum`). New items render on top.

## No New Files

All changes are modifications to existing files.
