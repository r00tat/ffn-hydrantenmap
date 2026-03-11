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

No Firestore index changes needed — ordering is done client-side.

## Map Rendering (Leaflet)

### Layer-level z-index

In `FirecallLayer.tsx`:

- Sort layers by `zIndex` ascending before rendering.
- Create a custom Leaflet **pane** per layer with CSS z-index = `400 + layer.zIndex`. This ensures all items in a higher-zIndex layer render above all items in a lower-zIndex layer.
- The default/unassigned layer gets pane z-index `400 + 0`, so named layers render above it by default.

### Item-level z-index within a layer

In `FirecallItemsLayer.tsx`:

- Sort items by `zIndex` ascending before rendering.
- **Markers**: Pass `item.zIndex` as `zIndexOffset` to Leaflet markers. Leaflet natively supports this for stacking markers.
- **Vector items** (areas, lines, circles): Rendered within their layer's pane. Since vectors in the same pane render in DOM order, the sort order controls visual stacking.

## Item Detail Dialog (z-index controls)

In `FirecallItemDialog.tsx`, add four icon buttons in `DialogActions` (only for existing items):

| Button | Icon | Action |
|---|---|---|
| Send to Back | VerticalAlignBottom | `zIndex = min(siblings) - 1` |
| Send Backward | ArrowDownward | Swap `zIndex` with the next lower item |
| Bring Forward | ArrowUpward | Swap `zIndex` with the next higher item |
| Bring to Front | VerticalAlignTop | `zIndex = max(siblings) + 1` |

"Siblings" = items in the same layer. Buttons save immediately and keep the dialog open.

Buttons are grouped on the left side of `DialogActions`, visually separated from Save/Delete/Copy.

## Layers Page (drag-and-drop reordering)

In `Layers.tsx`:

- Sort layer cards by `zIndex` descending (highest = top of list = renders on top of map).
- Add drag-and-drop reordering using `@dnd-kit/sortable` (already installed) with `SortableContext` and `useSortable` on layer cards.
- On drag end, recalculate `zIndex` values for all layers based on new positions and batch-update Firestore.
- Two drag behaviors coexist:
  1. Drag a **layer card** up/down to reorder layers (changes `zIndex`)
  2. Drag an **item card** onto a layer to reassign it (existing behavior)
- Items within layers continue to sort by `datum` on this page.

## Files to Modify

| File | Changes |
|---|---|
| `src/components/firebase/firestore.ts` | Add `zIndex?: number` to `FirecallItem` |
| `src/components/FirecallItems/elements/FirecallItemBase.tsx` | Add `zIndex` to constructor, `data()`, `copy()` |
| `src/components/Map/layers/FirecallLayer.tsx` | Sort layers by zIndex, create custom panes |
| `src/components/Map/layers/FirecallItemsLayer.tsx` | Sort items by zIndex, pass zIndexOffset |
| `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx` | Accept and apply zIndexOffset |
| `src/components/FirecallItems/FirecallItemDialog.tsx` | Add z-order buttons |
| `src/components/pages/Layers.tsx` | Sort layers by zIndex, add sortable drag-and-drop |
| `src/hooks/useFirecallLayers.ts` | May need to return sorted array alongside map |

## Backward Compatibility

Fully backward compatible. Existing items without `zIndex` default to `0` and maintain their current relative order (Firestore creation order). New items render on top.

## No New Files

All changes are modifications to existing files.
