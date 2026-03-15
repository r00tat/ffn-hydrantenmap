# Freehand Drawing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `drawing` item type to the Einsatzkarte map where users draw freehand strokes with color/width selection, undo, and save all strokes to Firestore as a parent item + stroke subcollection.

**Architecture:** A new `FirecallDrawing` class registered in `fcItemClasses` follows the existing item pattern. In-session state lives in `DrawingContext` (mirrors `LeitungsContext`). On save, a parent item document is written to `/call/{firecallId}/item/` and all strokes are batch-written to `/call/{firecallId}/item/{itemId}/stroke/`. Saved drawings render via `DrawingComponent` (Leaflet Polylines) after fetching the stroke subcollection once on mount.

**Tech Stack:** React 19, TypeScript, React-Leaflet, Firestore SDK v9+, MUI, simplify-js

**Spec:** `docs/superpowers/specs/2026-03-15-freehand-drawing-design.md`

---

## File Map

**Create:**
- `src/components/FirecallItems/elements/FirecallDrawing.tsx` — item class, registers as `drawing`
- `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx` — renders saved strokes
- `src/components/Map/Drawing/DrawingContext.tsx` — session state + Firestore save logic
- `src/components/Map/Drawing/DrawingCanvas.tsx` — event capture, RDP simplification, live preview
- `src/components/Map/Drawing/DrawingToolbar.tsx` — floating color/width/undo/done UI
- `src/hooks/useDrawingStrokes.ts` — fetch stroke subcollection on mount

**Modify:**
- `src/components/firebase/firestore.ts` — add `DrawingStroke` interface
- `src/components/FirecallItems/elements/index.tsx` — register `drawing: FirecallDrawing`
- `src/components/Map/Map.tsx` — add `DrawingProvider` + `DrawingCanvas` + `DrawingToolbar` alongside `LeitungsProvider`
- `src/components/Map/AddFirecallItem.tsx` — activate drawing mode for `type === 'drawing'`

---

## Chunk 1: Foundation — types, class, registration

### Task 1: Install simplify-js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd /Users/paul/Documents/Feuerwehr/hydranten-map/.worktrees/feature/freehand-drawing
npm install simplify-js
npm install --save-dev @types/simplify-js
```

- [ ] **Step 2: Verify lint passes**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add simplify-js for RDP path simplification"
```

---

### Task 2: Add DrawingStroke interface

**Files:**
- Modify: `src/components/firebase/firestore.ts` (after line ~100, after the `FirecallLayer` interface)

- [ ] **Step 1: Read the file to confirm insertion point**

Read `src/components/firebase/firestore.ts` lines 90–110. The `FirecallLayer` interface ends around line 100. Insert after it.

- [ ] **Step 2: Add the interface**

After the closing `}` of the `FirecallLayer` interface, add:

```typescript
export interface DrawingStroke {
  color: string; // hex color, e.g. '#ff0000'
  width: number; // stroke width in pixels, 1–20
  points: number[][]; // [[lat, lng], ...] — RDP-simplified geo coords
  order: number; // ascending integer — determines render order
}
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add DrawingStroke interface to firestore types"
```

---

### Task 3: Create FirecallDrawing class

**Files:**
- Create: `src/components/FirecallItems/elements/FirecallDrawing.tsx`

The class extends `FirecallItemBase`. It overrides `markerName`, `fields`, and `renderMarker`. It does NOT override `isPolyline` (returns `false` by default) because drawing mode is activated via a separate code path, not the polyline branch.

- [ ] **Step 1: Read FirecallItemBase to confirm constructor signature**

Read `src/components/FirecallItems/elements/FirecallItemBase.tsx` lines 1–60.

- [ ] **Step 2: Create the file**

```typescript
import React, { ReactNode } from 'react';
import { FirecallItem } from '../../firebase/firestore';
import { FirecallItemBase } from './FirecallItemBase';
import { MarkerRenderOptions } from './marker/FirecallItemDefault';
import DrawingComponent from './drawing/DrawingComponent';

export class FirecallDrawing extends FirecallItemBase {
  public constructor(firecallItem?: FirecallItem) {
    super(firecallItem);
    this.type = 'drawing';
  }

  public copy(): FirecallDrawing {
    return Object.assign(new FirecallDrawing(this.data()), this);
  }

  public markerName(): string {
    return 'Zeichnung';
  }

  public fields(): { [fieldName: string]: string } {
    return {
      name: 'Name',
    };
  }

  public static factory(): FirecallItemBase {
    return new FirecallDrawing();
  }

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
      />
    );
  }
}
```

- [ ] **Step 3: Create the stub DrawingComponent** (required to compile FirecallDrawing)

Create `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx`:

```typescript
import React from 'react';
import { FirecallItem } from '../../../firebase/firestore';

interface DrawingComponentProps {
  item: FirecallItem;
  pane?: string;
}

// Stub — real implementation in Chunk 2
export default function DrawingComponent({
  item,
}: DrawingComponentProps): React.ReactNode {
  return null;
}
```

- [ ] **Step 4: Register in fcItemClasses**

Read `src/components/FirecallItems/elements/index.tsx`. Add import:

```typescript
import { FirecallDrawing } from './FirecallDrawing';
```

Add entry to `fcItemClasses`:

```typescript
drawing: FirecallDrawing,
```

- [ ] **Step 5: Verify lint**

```bash
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallDrawing.tsx \
        src/components/FirecallItems/elements/drawing/DrawingComponent.tsx \
        src/components/FirecallItems/elements/index.tsx
git commit -m "feat: add FirecallDrawing item class and register drawing type"
```

---

## Chunk 2: Stroke loading + real DrawingComponent

### Task 4: Create useDrawingStrokes hook

**Files:**
- Create: `src/hooks/useDrawingStrokes.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  DrawingStroke,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../components/firebase/firestore';
import { useFirecallId } from './useFirecall';

export function useDrawingStrokes(itemId?: string): DrawingStroke[] {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const firecallId = useFirecallId();

  useEffect(() => {
    if (!itemId || !firecallId || firecallId === 'unknown') return;

    const strokesRef = collection(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      FIRECALL_ITEMS_COLLECTION_ID,
      itemId,
      'stroke'
    );
    const q = query(strokesRef, orderBy('order', 'asc'));

    getDocs(q).then((snapshot) => {
      setStrokes(snapshot.docs.map((doc) => doc.data() as DrawingStroke));
    });
  }, [itemId, firecallId]);

  return strokes;
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDrawingStrokes.ts
git commit -m "feat: add useDrawingStrokes hook for stroke subcollection"
```

---

### Task 5: Implement real DrawingComponent

**Files:**
- Modify: `src/components/FirecallItems/elements/drawing/DrawingComponent.tsx`

- [ ] **Step 1: Read ConnectionComponent for Polyline rendering pattern**

Read `src/components/FirecallItems/elements/connection/ConnectionComponent.tsx` lines 1–40.

- [ ] **Step 2: Replace the stub with the real implementation**

```typescript
import React from 'react';
import { Polyline } from 'react-leaflet';
import { FirecallItem } from '../../../firebase/firestore';
import { useDrawingStrokes } from '../../../../hooks/useDrawingStrokes';

interface DrawingComponentProps {
  item: FirecallItem;
  pane?: string;
}

export default function DrawingComponent({
  item,
  pane,
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
        />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/FirecallItems/elements/drawing/DrawingComponent.tsx
git commit -m "feat: implement DrawingComponent to render saved strokes as Polylines"
```

---

## Chunk 3: Drawing context with save logic

### Task 6: Create DrawingContext

**Files:**
- Create: `src/components/Map/Drawing/DrawingContext.tsx`

This mirrors `LeitungsContext`. The save logic lives here (writes parent item + batch-writes strokes). Uses `useFirecallId`, `useFirebaseLogin`, `firestore`.

- [ ] **Step 1: Read LeitungsContext for the pattern**

Read `src/components/Map/Leitungen/context.tsx` (already known — use as reference).

- [ ] **Step 2: Create the file**

```typescript
'use client';

import {
  addDoc,
  collection,
  doc,
  writeBatch,
} from 'firebase/firestore';
import React, {
  FC,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { firestore } from '../../firebase/firebase';
import {
  DrawingStroke,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../firebase/firestore';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../../hooks/useFirecall';

interface DrawingSessionItem {
  name: string;
  layer?: string;
}

interface DrawingContextValue {
  isDrawing: boolean;
  activeColor: string;
  activeWidth: number;
  strokes: DrawingStroke[];
  sessionItem?: DrawingSessionItem;
  startDrawing: (item: DrawingSessionItem) => void;
  commitStroke: (simplifiedPoints: [number, number][]) => void;
  undoLastStroke: () => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  save: () => Promise<void>;
  cancel: () => void;
}

export const DrawingContext = createContext<DrawingContextValue>(
  {} as DrawingContextValue
);

export const useDrawingProvider = (): DrawingContextValue => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeColor, setActiveColor] = useState('#ff0000');
  const [activeWidth, setActiveWidth] = useState(5);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [sessionItem, setSessionItem] = useState<DrawingSessionItem>();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const startDrawing = useCallback((item: DrawingSessionItem) => {
    setSessionItem(item);
    setStrokes([]);
    setIsDrawing(true);
  }, []);

  const commitStroke = useCallback(
    (simplifiedPoints: [number, number][]) => {
      if (simplifiedPoints.length < 2) return;
      setStrokes((prev) => {
        const newStroke: DrawingStroke = {
          color: activeColor,
          width: activeWidth,
          points: simplifiedPoints,
          order: prev.length, // index in the array = stable render order
        };
        return [...prev, newStroke];
      });
      },
    [activeColor, activeWidth]
  );

  const undoLastStroke = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const setColor = useCallback((color: string) => setActiveColor(color), []);
  const setWidth = useCallback((width: number) => setActiveWidth(width), []);

  const save = useCallback(async () => {
    if (!sessionItem || strokes.length === 0) return;
    if (!firecallId || firecallId === 'unknown') return;

    // Compute centroid from all points
    const allPoints = strokes.flatMap((s) => s.points);
    const lat = allPoints.reduce((sum, [la]) => sum + la, 0) / allPoints.length;
    const lng = allPoints.reduce((sum, [, ln]) => sum + ln, 0) / allPoints.length;

    // Write parent item
    const itemRef = await addDoc(
      collection(firestore, FIRECALL_COLLECTION_ID, firecallId, FIRECALL_ITEMS_COLLECTION_ID),
      {
        type: 'drawing',
        name: sessionItem.name,
        lat,
        lng,
        layer: sessionItem.layer || '',
        created: new Date().toISOString(),
        creator: email,
        deleted: false,
      }
    );

    // Batch-write strokes to subcollection
    const batch = writeBatch(firestore);
    for (const stroke of strokes) {
      const strokeRef = doc(
        collection(firestore, FIRECALL_COLLECTION_ID, firecallId, FIRECALL_ITEMS_COLLECTION_ID, itemRef.id, 'stroke')
      );
      batch.set(strokeRef, stroke);
    }
    await batch.commit();

    setIsDrawing(false);
    setStrokes([]);
    setSessionItem(undefined);
  }, [sessionItem, strokes, firecallId, email]);

  const cancel = useCallback(() => {
    setIsDrawing(false);
    setStrokes([]);
    setSessionItem(undefined);
  }, []);

  return {
    isDrawing,
    activeColor,
    activeWidth,
    strokes,
    sessionItem,
    startDrawing,
    commitStroke,
    undoLastStroke,
    setColor,
    setWidth,
    save,
    cancel,
  };
};

export interface DrawingProviderProps {
  children: ReactNode;
}

export const DrawingProvider: FC<DrawingProviderProps> = ({ children }) => {
  const drawing = useDrawingProvider();
  return (
    <DrawingContext.Provider value={drawing}>{children}</DrawingContext.Provider>
  );
};

export const useDrawing = () => useContext(DrawingContext);
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Map/Drawing/DrawingContext.tsx
git commit -m "feat: add DrawingContext with session state and Firestore save"
```

---

## Chunk 4: DrawingCanvas + DrawingToolbar

### Task 7: Create DrawingCanvas

**Files:**
- Create: `src/components/Map/Drawing/DrawingCanvas.tsx`

Key design: raw points accumulate in a `useRef` (no re-renders on every mousemove). A separate `previewPoints` state (updated throttled) drives the live Polyline preview. On mouse/touch end, RDP simplification is applied to the ref's points before calling `commitStroke`.

- [ ] **Step 1: Create the file**

```typescript
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Polyline, useMap } from 'react-leaflet';
import simplify from 'simplify-js';
import { useDrawing } from './DrawingContext';

const THROTTLE_MS = 50;
const RDP_TOLERANCE = 0.00003; // ~3 metres

export default function DrawingCanvas() {
  const map = useMap();
  const drawing = useDrawing();
  const rawPointsRef = useRef<[number, number][]>([]);
  const isPointerDownRef = useRef(false);
  const lastCaptureRef = useRef(0);
  const [previewPoints, setPreviewPoints] = useState<[number, number][]>([]);

  // Disable map dragging only while in drawing mode
  useEffect(() => {
    if (!drawing.isDrawing) return;
    map.dragging.disable();
    map.scrollWheelZoom.disable();
    return () => {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
    };
  }, [map, drawing.isDrawing]);

  const getLatLng = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = map.getContainer().getBoundingClientRect();
      const latlng = map.containerPointToLatLng([
        clientX - rect.left,
        clientY - rect.top,
      ]);
      return [latlng.lat, latlng.lng];
    },
    [map]
  );

  const commitCurrentStroke = useCallback(() => {
    const raw = rawPointsRef.current;
    if (raw.length < 2) {
      rawPointsRef.current = [];
      setPreviewPoints([]);
      return;
    }
    const simplified = simplify(
      raw.map(([x, y]) => ({ x, y })),
      RDP_TOLERANCE,
      true
    ).map(({ x, y }) => [x, y] as [number, number]);

    drawing.commitStroke(simplified);
    rawPointsRef.current = [];
    setPreviewPoints([]);
  }, [drawing]);

  useEffect(() => {
    if (!drawing.isDrawing) return;
    const container = map.getContainer();

    const handleDown = (clientX: number, clientY: number) => {
      isPointerDownRef.current = true;
      rawPointsRef.current = [];
      const pt = getLatLng(clientX, clientY);
      rawPointsRef.current.push(pt);
      setPreviewPoints([pt]);
    };

    const handleMove = (clientX: number, clientY: number) => {
      if (!isPointerDownRef.current) return;
      const now = Date.now();
      if (now - lastCaptureRef.current < THROTTLE_MS) return;
      lastCaptureRef.current = now;
      const pt = getLatLng(clientX, clientY);
      rawPointsRef.current.push(pt);
      setPreviewPoints((prev) => [...prev, pt]);
    };

    const handleUp = () => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      commitCurrentStroke();
    };

    const onMouseDown = (e: MouseEvent) => handleDown(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleUp();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      handleDown(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handleUp();
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [map, drawing.isDrawing, getLatLng, commitCurrentStroke]);

  if (!drawing.isDrawing) return null;

  return (
    <>
      {/* Live preview of stroke in progress */}
      {previewPoints.length > 1 && (
        <Polyline
          positions={previewPoints}
          pathOptions={{
            color: drawing.activeColor,
            weight: drawing.activeWidth,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      {/* Preview of committed (unsaved) strokes */}
      {drawing.strokes.map((stroke, idx) => (
        <Polyline
          key={idx}
          positions={stroke.points as [number, number][]}
          pathOptions={{
            color: stroke.color,
            weight: stroke.width,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Verify lint**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/Drawing/DrawingCanvas.tsx
git commit -m "feat: add DrawingCanvas with event capture and RDP simplification"
```

---

### Task 8: Create DrawingToolbar

**Files:**
- Create: `src/components/Map/Drawing/DrawingToolbar.tsx`

Floating panel, bottom-center of the map viewport. Uses MUI components (Box, Button, IconButton, Tooltip, Stack) — consistent with the rest of the app.

- [ ] **Step 1: Read a nearby MUI toolbar for import patterns**

Read `src/components/Map/ActionButtons.tsx` lines 1–30 to confirm MUI import style.

- [ ] **Step 2: Create the file**

```typescript
'use client';

import UndoIcon from '@mui/icons-material/Undo';
import {
  Box,
  Button,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import React from 'react';
import { useDrawing } from './DrawingContext';

const PRESET_COLORS = [
  { label: 'Rot', value: '#e53935' },
  { label: 'Orange', value: '#fb8c00' },
  { label: 'Gelb', value: '#fdd835' },
  { label: 'Grün', value: '#43a047' },
  { label: 'Blau', value: '#1e88e5' },
  { label: 'Weiß', value: '#ffffff' },
  { label: 'Schwarz', value: '#212121' },
  { label: 'Magenta', value: '#e91e63' },
];

const PRESET_WIDTHS = [
  { label: 'Dünn', value: 2 },
  { label: 'Mittel', value: 5 },
  { label: 'Dick', value: 10 },
];

export default function DrawingToolbar() {
  const drawing = useDrawing();

  if (!drawing.isDrawing) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 4,
        px: 2,
        py: 1,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        {/* Color swatches */}
        <Stack direction="row" spacing={0.5}>
          {PRESET_COLORS.map((c) => (
            <Tooltip key={c.value} title={c.label}>
              <Box
                onClick={() => drawing.setColor(c.value)}
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: c.value,
                  border:
                    drawing.activeColor === c.value
                      ? '3px solid #1976d2'
                      : '2px solid #bdbdbd',
                  cursor: 'pointer',
                }}
              />
            </Tooltip>
          ))}
        </Stack>

        {/* Width presets */}
        <ToggleButtonGroup
          value={drawing.activeWidth}
          exclusive
          size="small"
          onChange={(_, v) => v !== null && drawing.setWidth(v)}
        >
          {PRESET_WIDTHS.map((w) => (
            <ToggleButton key={w.value} value={w.value}>
              {w.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Undo */}
        <Tooltip title="Letzten Strich rückgängig">
          <span>
            <IconButton
              size="small"
              disabled={drawing.strokes.length === 0}
              onClick={drawing.undoLastStroke}
            >
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Done */}
        <Button
          variant="contained"
          color="primary"
          size="small"
          disabled={drawing.strokes.length === 0}
          onClick={() => drawing.save()}
        >
          Fertig
        </Button>

        {/* Cancel */}
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          onClick={drawing.cancel}
        >
          Abbrechen
        </Button>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 3: Verify lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Map/Drawing/DrawingToolbar.tsx
git commit -m "feat: add DrawingToolbar with color swatches, width presets, undo, save"
```

---

## Chunk 5: Map integration

### Task 9: Wire DrawingProvider + DrawingCanvas + DrawingToolbar into Map.tsx

**Files:**
- Modify: `src/components/Map/Map.tsx`

- [ ] **Step 1: Read the relevant section of Map.tsx**

Read `src/components/Map/Map.tsx` lines 155–175 to see exactly where `LeitungsProvider` is used.

- [ ] **Step 2: Add imports at the top of the file**

Add alongside the LeitungsProvider import:

```typescript
import { DrawingProvider } from './Drawing/DrawingContext';
import DrawingCanvas from './Drawing/DrawingCanvas';
import DrawingToolbar from './Drawing/DrawingToolbar';
```

- [ ] **Step 3: Wrap with DrawingProvider and add canvas/toolbar**

In the map JSX, wrap the same section where `LeitungsProvider` appears. Add `DrawingProvider` as a sibling wrapper and add `DrawingCanvas` + `DrawingToolbar` as siblings to `Leitungen`:

```tsx
<LeitungsProvider>
  <DrawingProvider>
    <ActionButtons />
    <Leitungen />
    <DrawingCanvas />   {/* only renders when isDrawing === true */}
    <DrawingToolbar />  {/* only renders when isDrawing === true */}
  </DrawingProvider>
</LeitungsProvider>
```

Note: `DrawingCanvas` uses `useMap()` so it must be inside the Leaflet `MapContainer`. It is safe here since it's already inside the map.

Note: `DrawingToolbar` renders as a `position: fixed` overlay so it can live anywhere inside the map tree.

- [ ] **Step 4: Verify lint**

```bash
npm run lint
```

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds (or only pre-existing errors, not new ones)

- [ ] **Step 6: Commit**

```bash
git add src/components/Map/Map.tsx
git commit -m "feat: add DrawingProvider, DrawingCanvas, DrawingToolbar to map"
```

---

### Task 10: Activate drawing mode in AddFirecallItem

**Files:**
- Modify: `src/components/Map/AddFirecallItem.tsx`

- [ ] **Step 1: Read AddFirecallItem.tsx**

Read the full file (already known from exploration). The key section is in `fzgDialogClose`:

```typescript
if (fcItemClasses[fzg?.type || '']?.isPolyline()) {
  leitungen.setIsDrawing(true);
  leitungen.setFirecallItem(fzg as Connection);
} else {
  // ... existing logic for non-polyline items
}
```

- [ ] **Step 2: Add useDrawing import**

Add to imports:

```typescript
import { useDrawing } from './Drawing/DrawingContext';
```

- [ ] **Step 3: Add useDrawing hook call**

After the existing `const leitungen = useLeitungen();` line, add:

```typescript
const drawingCtx = useDrawing();
```

- [ ] **Step 4: Add the drawing branch in fzgDialogClose**

Change the if/else to add a third branch for drawing type:

```typescript
if (fcItemClasses[fzg?.type || '']?.isPolyline()) {
  leitungen.setIsDrawing(true);
  leitungen.setFirecallItem(fzg as Connection);
} else if (fzg?.type === 'drawing') {
  drawingCtx.startDrawing({
    name: fzg.name || 'Zeichnung',
    layer: fzg.layer,
  });
} else {
  // existing logic unchanged
  if (fzg) {
    // ...
  }
}
```

- [ ] **Step 5: Update `fzgDialogClose` dependency array**

The existing `useCallback` dependency array is:

```typescript
[leitungen, map, saveItem, setEditFirecallItemIsOpen, setLastSelectedLayer]
```

Add `drawingCtx` to it:

```typescript
[leitungen, drawingCtx, map, saveItem, setEditFirecallItemIsOpen, setLastSelectedLayer]
```

- [ ] **Step 6: Verify lint**

```bash
npm run lint
```

- [ ] **Step 7: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 8: Commit**

```bash
git add src/components/Map/AddFirecallItem.tsx
git commit -m "feat: activate drawing mode in AddFirecallItem for drawing type"
```

---

## Chunk 6: Final verification

### Task 11: End-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual test — create a drawing**

1. Open the app, navigate to a firecall
2. Click the add item FAB, select type `Zeichnung` (drawing), enter a name, optionally assign to a layer → OK
3. The `DrawingToolbar` appears bottom-center
4. Draw a stroke on the map by holding mouse button and dragging — a colored Polyline appears live
5. Release — stroke is committed to the buffer
6. Change color via swatch, change width via toggle — draw another stroke
7. Click Undo — last stroke disappears
8. Click Fertig (Done) — drawing mode exits, toolbar disappears
9. The drawing appears on the map as rendered Polylines
10. Reload the page — drawing reloads correctly from Firestore

- [ ] **Step 3: Manual test — touch device (or browser device simulation)**

1. Enable touch simulation in browser devtools
2. Repeat the drawing flow using touch events
3. Verify strokes capture correctly

- [ ] **Step 4: Manual test — cancel**

1. Start drawing, draw a stroke
2. Click Abbrechen (Cancel)
3. Drawing mode exits, no item saved to Firestore
4. Confirm no new item appears in the items list

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

- [ ] **Step 6: Run build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit any fixes, then final commit**

```bash
git checkout -- next-env.d.ts
git add -A
git commit -m "feat: freehand drawing complete — e2e verified"
```
