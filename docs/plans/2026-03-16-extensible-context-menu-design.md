# Extensible Context Menu for All Map Items

**Date:** 2026-03-16
**Status:** Approved

## Problem

Right-click context menus (edit, delete, z-order) only work on marker-based items rendered via `FirecallItemMarkerDefault` and items that explicitly forward `onContextMenu` (areas, circles, connections). Drawings (`FirecallDrawing`) have no context menu support. There is also no mechanism for item types to add custom context menu entries.

## Design

### 1. Extension Point on `FirecallItemBase`

Add a new method to `FirecallItemBase`:

```typescript
public contextMenuItems(onClose: () => void): ReactNode {
  return null;
}
```

Subclasses override this to return custom `<MenuItem>` elements. The base implementation returns `null` (no custom actions).

### 2. `ZOrderContextMenu` Changes

- Add `customActions?: ReactNode` prop
- Render `customActions` between the edit/delete section and the z-order section
- Add a `<Divider>` before custom actions when both edit/delete and custom actions are present

### 3. `FirecallItemsLayer` Changes

- When building the context menu, resolve the item instance via `getItemInstance(contextMenuTarget)`
- Call `instance.contextMenuItems(closeContextMenu)` to get custom actions
- Pass the result as `customActions` to `ZOrderContextMenu`

### 4. Drawing Context Menu Support

- `FirecallDrawing.renderMarker()`: forward `options.onContextMenu` to `DrawingComponent`
- `DrawingComponent`: accept `onContextMenu` prop, attach `contextmenu` event handler to each `<Polyline>` via `eventHandlers`

### 5. Menu Structure

```
┌─────────────────────┐
│ Bearbeiten           │  ← standard (if editable)
│ Löschen              │  ← standard (if editable)
├─────────────────────┤
│ (custom actions)     │  ← per-type, from contextMenuItems()
├─────────────────────┤
│ Ganz nach vorne      │  ← z-order (if editable)
│ Nach vorne           │
│ Nach hinten          │
│ Ganz nach hinten     │
└─────────────────────┘
```

### 6. Files Changed

| File | Change |
|------|--------|
| `src/components/FirecallItems/elements/FirecallItemBase.tsx` | Add `contextMenuItems()` method |
| `src/components/FirecallItems/ZOrderContextMenu.tsx` | Add `customActions` prop, render between sections |
| `src/components/Map/layers/FirecallItemsLayer.tsx` | Compute `customActions` from item instance, pass to menu |
| `src/components/FirecallItems/elements/FirecallDrawing.tsx` | Forward `onContextMenu` to `DrawingComponent` |
| `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx` | Accept and attach `onContextMenu` to polylines |
