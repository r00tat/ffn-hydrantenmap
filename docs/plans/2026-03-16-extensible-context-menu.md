# Extensible Context Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make right-click context menus work on all map items (including drawings) with standard actions (edit, delete, z-order) and an extension point for per-type custom actions.

**Architecture:** Add `contextMenuItems()` virtual method to `FirecallItemBase` for per-type custom entries. Extend `ZOrderContextMenu` to accept and render custom actions. Wire up `onContextMenu` on drawings via polyline event handlers.

**Tech Stack:** React, MUI Menu/MenuItem, Leaflet event handlers, react-leaflet Polyline

---

### Task 1: Add `contextMenuItems()` to `FirecallItemBase`

**Files:**
- Modify: `src/components/FirecallItems/elements/FirecallItemBase.tsx:286` (after `renderMarker`)
- Test: `src/components/FirecallItems/elements/__tests__/FirecallItemBase.test.ts`

**Step 1: Write the failing test**

Create `src/components/FirecallItems/elements/__tests__/FirecallItemBase.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { FirecallItemBase } from '../FirecallItemBase';

describe('FirecallItemBase.contextMenuItems', () => {
  it('returns null by default', () => {
    const item = new FirecallItemBase();
    const onClose = vi.fn();
    expect(item.contextMenuItems(onClose)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/FirecallItems/elements/__tests__/FirecallItemBase.test.ts`
Expected: FAIL — `contextMenuItems` is not a function

**Step 3: Write minimal implementation**

In `src/components/FirecallItems/elements/FirecallItemBase.tsx`, add after the `renderMarker` method (after line 285):

```typescript
public contextMenuItems(_onClose: () => void): ReactNode {
  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/FirecallItems/elements/__tests__/FirecallItemBase.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallItemBase.tsx src/components/FirecallItems/elements/__tests__/FirecallItemBase.test.ts
git commit -m "feat: add contextMenuItems() extension point to FirecallItemBase"
```

---

### Task 2: Extend `ZOrderContextMenu` to render custom actions

**Files:**
- Modify: `src/components/FirecallItems/ZOrderContextMenu.tsx`
- Test: `src/components/FirecallItems/__tests__/ZOrderContextMenu.test.tsx`

**Step 1: Write the failing test**

Create `src/components/FirecallItems/__tests__/ZOrderContextMenu.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import MenuItem from '@mui/material/MenuItem';
import ZOrderContextMenu from '../ZOrderContextMenu';

describe('ZOrderContextMenu', () => {
  it('renders custom actions between edit/delete and z-order sections', () => {
    const item = { id: '1', name: 'Test', type: 'marker' } as any;
    const customActions = <MenuItem data-testid="custom-action">Custom Action</MenuItem>;

    render(
      <ZOrderContextMenu
        item={item}
        siblings={[item]}
        anchorPosition={{ top: 100, left: 100 }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        customActions={customActions}
      />
    );

    expect(screen.getByTestId('custom-action')).toBeDefined();
    expect(screen.getByText('Custom Action')).toBeDefined();
  });

  it('renders without custom actions when none provided', () => {
    const item = { id: '1', name: 'Test', type: 'marker' } as any;

    render(
      <ZOrderContextMenu
        item={item}
        siblings={[item]}
        anchorPosition={{ top: 100, left: 100 }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Bearbeiten')).toBeDefined();
    expect(screen.getByText('Löschen')).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/FirecallItems/__tests__/ZOrderContextMenu.test.tsx`
Expected: FAIL — `customActions` prop not used / custom action not rendered

**Step 3: Implement the changes**

In `src/components/FirecallItems/ZOrderContextMenu.tsx`:

1. Add `customActions?: ReactNode` to `ZOrderContextMenuProps` interface (and `ReactNode` import)
2. Destructure `customActions` in the component
3. After the edit/delete `{editable && <Divider />}` block (line 62), add:

```typescript
{customActions && (
  <>
    {customActions}
    <Divider />
  </>
)}
```

Move the existing `{editable && <Divider />}` so it only renders when editable AND there are items above.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/FirecallItems/__tests__/ZOrderContextMenu.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/FirecallItems/ZOrderContextMenu.tsx src/components/FirecallItems/__tests__/ZOrderContextMenu.test.tsx
git commit -m "feat: support custom actions in ZOrderContextMenu"
```

---

### Task 3: Wire up `customActions` in `FirecallItemsLayer`

**Files:**
- Modify: `src/components/Map/layers/FirecallItemsLayer.tsx`

**Step 1: Add the import**

`getItemInstance` is already imported. No new imports needed.

**Step 2: Compute customActions from the context menu target**

Add a `useMemo` after `closeContextMenu` (line 118):

```typescript
const customActions = useMemo(() => {
  if (!contextMenuTarget) return undefined;
  const instance = getItemInstance(contextMenuTarget);
  return instance.contextMenuItems(closeContextMenu);
}, [contextMenuTarget, closeContextMenu]);
```

**Step 3: Pass customActions to ZOrderContextMenu**

On the `<ZOrderContextMenu>` element (line 162), add the prop:

```typescript
<ZOrderContextMenu
  item={contextMenuTarget}
  siblings={records}
  anchorPosition={contextMenuPos}
  onClose={closeContextMenu}
  onEdit={editable ? handleEdit : undefined}
  onDelete={editable ? handleDelete : undefined}
  customActions={customActions}
/>
```

**Step 4: Run all tests**

Run: `npm run test`
Expected: All existing tests PASS

**Step 5: Commit**

```bash
git add src/components/Map/layers/FirecallItemsLayer.tsx
git commit -m "feat: compute and pass custom context menu actions in FirecallItemsLayer"
```

---

### Task 4: Add context menu support to drawings

**Files:**
- Modify: `src/components/FirecallItems/elements/FirecallDrawing.tsx`
- Modify: `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx`

**Step 1: Update `DrawingComponent` to accept and use `onContextMenu`**

In `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx`:

Add `onContextMenu` to the props interface:

```typescript
interface DrawingComponentProps {
  item: FirecallItem;
  pane?: string;
  onContextMenu?: (item: FirecallItem, event: L.LeafletMouseEvent) => void;
}
```

Add the import for `L` from `leaflet`.

Destructure `onContextMenu` and attach it to each `<Polyline>` via `eventHandlers`:

```typescript
export default function DrawingComponent({
  item,
  pane,
  onContextMenu,
}: DrawingComponentProps): React.ReactNode {
  const strokes = useDrawingStrokes(item.id);

  return (
    <>
      {strokes.map((stroke, idx) => (
        <Polyline
          key={idx}
          positions={stroke.points.map(([lat, lng]) => [lat, lng] as [number, number])}
          pathOptions={{
            color: stroke.color,
            weight: stroke.width,
            lineCap: 'round',
            lineJoin: 'round',
          }}
          pane={pane}
          eventHandlers={
            onContextMenu
              ? {
                  contextmenu: (e: L.LeafletMouseEvent) => {
                    e.originalEvent.preventDefault();
                    onContextMenu(item, e);
                  },
                }
              : undefined
          }
        />
      ))}
    </>
  );
}
```

**Step 2: Update `FirecallDrawing.renderMarker()` to forward `onContextMenu`**

In `src/components/FirecallItems/elements/FirecallDrawing.tsx`, change `renderMarker`:

```typescript
public renderMarker(
  selectItem: (item: FirecallItem) => void,
  options: MarkerRenderOptions = {}
): ReactNode {
  if (!this.id) return null;
  return (
    <DrawingComponent
      key={this.id}
      item={this.data() as FirecallItem}
      pane={options.pane}
      onContextMenu={options.onContextMenu}
    />
  );
}
```

**Step 3: Run all tests**

Run: `npm run test`
Expected: All tests PASS

**Step 4: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 5: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallDrawing.tsx src/components/FirecallItems/elements/drawing/DrawingComponent.tsx
git commit -m "feat: add context menu support to drawings"
```

---

### Task 5: Run lint and full test suite

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests PASS

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Fix any issues found, then commit if fixes were needed**
