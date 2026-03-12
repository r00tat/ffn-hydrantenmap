# Layer & Object Z-Index Ordering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add z-index ordering controls for map layers and objects, enabling users to control visual stacking order on the Leaflet map.

**Architecture:** Numeric `zIndex` field on `FirecallItem` (inherited by `FirecallLayer`). Leaflet custom panes per layer for layer-level z-ordering. Item-level ordering via `zIndexOffset` on markers and DOM sort order for vectors. Drag-and-drop layer reordering on the Layers page, z-order buttons in the item detail dialog.

**Tech Stack:** React 19, Next.js 16, TypeScript, Leaflet/React Leaflet (Pane component), Firebase Firestore, MUI, @dnd-kit/core + @dnd-kit/sortable

**Spec:** `docs/superpowers/specs/2026-03-11-layer-object-zindex-ordering-design.md`

---

## Chunk 1: Data Model & Hook Changes

### Task 1: Add `zIndex` to `FirecallItem` interface

**Files:**
- Modify: `src/components/firebase/firestore.ts:24-50`

- [ ] **Step 1: Add `zIndex` field to `FirecallItem` interface**

In `src/components/firebase/firestore.ts`, add `zIndex?: number;` to the `FirecallItem` interface after the `layer` field (around line 42):

```typescript
  /**
   * reference to FirecallLayer
   */
  layer?: string;

  /**
   * z-index for rendering order. Higher values render on top.
   */
  zIndex?: number;
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors related to `zIndex`

- [ ] **Step 3: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat: add zIndex field to FirecallItem interface"
```

### Task 2: Add `zIndex` to `FirecallItemBase` class

**Files:**
- Modify: `src/components/FirecallItems/elements/FirecallItemBase.tsx:77-153`

- [ ] **Step 1: Add `zIndex` to the constructor destructuring**

In `FirecallItemBase` constructor (line 78-99), add `zIndex` to the destructured assignment:

```typescript
  constructor(firecallItem?: FirecallItem) {
    ({
      id: this.id = '',
      name: this.name = '',
      beschreibung: this.beschreibung = '',
      lat: this.lat = defaultPosition.lat,
      lng: this.lng = defaultPosition.lng,
      type: this.type = 'fallback',
      original: this.original,
      datum: this.datum = '',
      rotation: this.rotation = '0',
      layer: this.layer = '',
      zIndex: this.zIndex = 0,
      deleted: this.deleted = false,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
      creator: this.creator,
      created: this.created,
      alt: this.alt,
      draggable: this.draggable = true,
      eventHandlers: this.eventHandlers = {},
    } = firecallItem || {});
  }
```

- [ ] **Step 2: Add `zIndex` property declaration**

Add after the `layer` property (around line 117):

```typescript
  layer: string;
  zIndex: number;
```

- [ ] **Step 3: Add `zIndex` to the `data()` method**

In the `data()` method (line 136-153), add `zIndex`:

```typescript
  public data(): FirecallItem {
    return {
      id: this.id,
      lat: this.lat,
      lng: this.lng,
      alt: this.alt,
      name: this.name,
      beschreibung: this.beschreibung,
      type: this.type,
      datum: this.datum,
      rotation: this.rotation,
      layer: this.layer,
      zIndex: this.zIndex,
      creator: this.creator,
      created: this.created,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy,
    };
  }
```

- [ ] **Step 4: Fix `filteredData()` to preserve numeric zero values**

The existing `filteredData()` method (line 155-159) filters out all falsy values, which would drop `zIndex: 0`. Update it to keep numeric values including zero:

```typescript
  public filteredData(): FirecallItem {
    return Object.fromEntries(
      Object.entries(this.data()).filter(
        ([key, value]) => value || typeof value === 'number'
      ),
    ) as FirecallItem;
  }
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/components/FirecallItems/elements/FirecallItemBase.tsx
git commit -m "feat: add zIndex to FirecallItemBase constructor and data()"
```

### Task 2b: Fix `useFirecallItemUpdate` to preserve `zIndex: 0`

**Files:**
- Modify: `src/hooks/useFirecallItemUpdate.ts:22-27`

**Why:** The existing falsy filter (`filter(([k, v]) => v)`) drops `zIndex: 0` because `0` is falsy in JavaScript. Since `merge: false` replaces the entire document, this would delete the `zIndex` field. The same fix applies to `useFirecallItemAdd.ts`.

- [ ] **Step 1: Fix the falsy filter in `useFirecallItemUpdate`**

In `src/hooks/useFirecallItemUpdate.ts`, change line 23 from:

```typescript
          .filter(([k, v]) => v)
```

to:

```typescript
          .filter(([k, v]) => v !== undefined && v !== null && v !== '')
```

This preserves `0`, `false`, and other valid falsy values while still filtering out `undefined`, `null`, and empty strings.

- [ ] **Step 2: Apply the same fix to `useFirecallItemAdd`**

In `src/hooks/useFirecallItemAdd.ts`, change line 22 from:

```typescript
          .filter(([k, v]) => v)
```

to:

```typescript
          .filter(([k, v]) => v !== undefined && v !== null && v !== '')
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFirecallItemUpdate.ts src/hooks/useFirecallItemAdd.ts
git commit -m "fix: preserve numeric zero values in Firestore writes"
```

### Task 2c: Auto-assign `zIndex = max + 1` for new items

**Files:**
- Modify: `src/hooks/useFirecallItemAdd.ts`

**Why:** The spec requires new items get `max(existing zIndex in scope) + 1`. Rather than fixing every caller, handle this centrally in the add hook. If `zIndex` is not explicitly set (undefined), compute it from siblings. For simplicity, we use a high timestamp-based value so it's always higher than existing items without needing to query siblings.

- [ ] **Step 1: Auto-assign zIndex in `useFirecallItemAdd`**

In `src/hooks/useFirecallItemAdd.ts`, after building `newData` (around line 19-28), add zIndex assignment if not already set:

```typescript
    async (item: FirecallItem) => {
      const newData: any = {
        datum: new Date().toISOString(),
        ...Object.entries(item)
          .filter(([k, v]) => v !== undefined && v !== null && v !== '')
          .reduce((p, [k, v]) => {
            p[k] = v;
            return p;
          }, {} as any),
        created: new Date().toISOString(),
        creator: email,
      };
      // New items render on top by default: use Date.now() as a monotonically
      // increasing zIndex that is always higher than manually assigned values.
      if (newData.zIndex === undefined || newData.zIndex === null) {
        newData.zIndex = Date.now();
      }
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFirecallItemAdd.ts
git commit -m "feat: auto-assign zIndex for new items to render on top"
```

### Task 3: Update `useFirecallLayers` hook to return sorted array

**Files:**
- Modify: `src/hooks/useFirecallLayers.ts`
- Modify: `src/components/providers/FirecallLayerProvider.tsx`

- [ ] **Step 1: Add sorted array and update context type**

Replace the entire `src/hooks/useFirecallLayers.ts` with:

```typescript
'use client';

import { orderBy } from 'firebase/firestore';
import React, { useContext, useMemo } from 'react';
import { SimpleMap } from '../common/types';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FirecallLayer,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { useHistoryPathSegments } from './useMapEditor';

export type FirecallLayers = SimpleMap<FirecallLayer>;

export interface FirecallLayersContextValue {
  layersMap: FirecallLayers;
  sortedLayers: FirecallLayer[];
}

export const FirecallLayersContext =
  React.createContext<FirecallLayersContextValue>({
    layersMap: {},
    sortedLayers: [],
  });

/**
 * Returns the layers map (keyed by ID) for lookup.
 * Use `useFirecallLayersSorted` for ordered iteration.
 */
export const useFirecallLayers = (): FirecallLayers => {
  const { layersMap } = useContext(FirecallLayersContext);
  return layersMap;
};

/**
 * Returns layers sorted by zIndex ascending (lowest first = renders behind).
 */
export const useFirecallLayersSorted = (): FirecallLayer[] => {
  const { sortedLayers } = useContext(FirecallLayersContext);
  return sortedLayers;
};

export function sortByZIndex<T extends { zIndex?: number; datum?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const zA = a.zIndex ?? 0;
    const zB = b.zIndex ?? 0;
    if (zA !== zB) return zA - zB;
    return (a.datum ?? '').localeCompare(b.datum ?? '');
  });
}

export function useFirecallLayersFromFirstore(): FirecallLayersContextValue {
  const firecallId = useFirecallId();
  const historyPathSegments = useHistoryPathSegments();

  const layers = useFirebaseCollection<FirecallLayer>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_LAYERS_COLLECTION_ID,
    ],
    filterFn: filterActiveItems,
    queryConstraints: [orderBy('name', 'asc')],
  });

  return useMemo(() => {
    const layersMap = Object.fromEntries(layers.map((l) => [l.id, l]));
    const sortedLayers = sortByZIndex(layers);
    return { layersMap, sortedLayers };
  }, [layers]);
}
```

- [ ] **Step 2: Update FirecallLayerProvider**

Replace `src/components/providers/FirecallLayerProvider.tsx`:

```typescript
import {
  FirecallLayersContext,
  useFirecallLayersFromFirstore,
} from '../../hooks/useFirecallLayers';

export default function FirecallLayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const layersContextValue = useFirecallLayersFromFirstore();
  return (
    <FirecallLayersContext.Provider value={layersContextValue}>
      {children}
    </FirecallLayersContext.Provider>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors. Existing callers of `useFirecallLayers()` still get the map.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFirecallLayers.ts src/components/providers/FirecallLayerProvider.tsx
git commit -m "feat: add sorted layers array and sortByZIndex utility to useFirecallLayers"
```

---

## Chunk 2: Map Rendering with Panes and Z-Index

### Task 4: Add `pane` to `MarkerRenderOptions` and thread through base class

**Files:**
- Modify: `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx:18-23, 72-132`
- Modify: `src/components/FirecallItems/elements/FirecallItemBase.tsx:254-271`

- [ ] **Step 1: Add `pane` to `MarkerRenderOptions`**

In `src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx`, add `pane` to the interface (line 18-23):

```typescript
export interface MarkerRenderOptions {
  /* do not show the popup */
  hidePopup?: boolean;
  /* disable click handler (used for preview markers during placement) */
  disableClick?: boolean;
  /* Leaflet pane name for z-index layering */
  pane?: string;
}
```

- [ ] **Step 2: Pass `pane` to `RotatedMarker`**

In `FirecallItemMarkerDefault` (line 72-132), destructure `pane` from options and pass it to `RotatedMarker`:

```typescript
export function FirecallItemMarkerDefault({
  record,
  selectItem,
  options: { hidePopup, disableClick, pane } = {},
  children,
}: FirecallItemMarkerProps) {
```

Then on the `RotatedMarker` component (around line 99), add the `pane` prop:

```typescript
      <RotatedMarker
        position={startPos}
        title={record.titleFn()}
        icon={icon}
        draggable={editable && record.draggable}
        autoPan={false}
        pane={pane}
        eventHandlers={{
```

- [ ] **Step 3: Verify `FirecallItemBase.renderMarker` passes options through**

In `src/components/FirecallItems/elements/FirecallItemBase.tsx`, the `renderMarker` method (line 254-271) already accepts and passes `options` to `FirecallItemMarkerDefault`. No change needed here.

**Important:** Subclasses that override `renderMarker` (like `FirecallMultiPoint`, `FirecallArea`, `CircleMarker`) do NOT yet accept `options` — they will be fixed in Task 5. Until Task 5 is complete, pane propagation only works for the base marker type.

```typescript
  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {},
  ): ReactNode {
    try {
      return (
        <FirecallItemMarkerDefault
          record={this}
          selectItem={selectItem}
          key={this.id}
          options={options}
        />
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }
```

Confirm this compiles — the `pane` will be in `options` and forwarded.

- [ ] **Step 4: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/components/FirecallItems/elements/marker/FirecallItemDefault.tsx
git commit -m "feat: add pane prop to MarkerRenderOptions and RotatedMarker"
```

### Task 5: Thread `pane` through vector renderers

**Files:**
- Modify: `src/components/FirecallItems/elements/CircleMarker.tsx:109-131`
- Modify: `src/components/FirecallItems/elements/FirecallArea.tsx:118-120`
- Modify: `src/components/FirecallItems/elements/area/AreaComponent.tsx:26-29, 61-157`
- Modify: `src/components/FirecallItems/elements/FirecallMultiPoint.tsx:135-144`
- Modify: `src/components/FirecallItems/elements/connection/ConnectionComponent.tsx:24-27, 62-182`

- [ ] **Step 1: Update `CircleMarker.renderMarker`**

In `src/components/FirecallItems/elements/CircleMarker.tsx`, update `renderMarker` (line 109-131) to accept and use `pane`:

```typescript
  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    { hidePopup = false, pane }: MarkerRenderOptions = {}
  ) {
    return (
      <>
        {!hidePopup && super.renderMarker(selectItem, { pane })}
        <LeafletCircle
          key={'circle' + this.id}
          radius={this.radius}
          center={L.latLng(this.lat, this.lng)}
          pane={pane}
          pathOptions={{
            color: this.color,
            fill: this.fill === 'true',
            opacity: this.opacity / 100,
            fillOpacity: this.opacity / 100 / 3,
          }}
        >
          {!hidePopup && this.renderPopup(selectItem)}
        </LeafletCircle>
      </>
    );
  }
```

- [ ] **Step 2: Update `FirecallArea.renderMarker`**

In `src/components/FirecallItems/elements/FirecallArea.tsx`, update `renderMarker` (line 118-120) to accept and forward `pane`:

```typescript
  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    return (
      <AreaMarker
        record={this}
        selectItem={selectItem}
        key={this.id}
        pane={options.pane}
      />
    );
  }
```

- [ ] **Step 3: Update `AreaMarker` component to accept and use `pane`**

In `src/components/FirecallItems/elements/area/AreaComponent.tsx`:

Update the props interface (line 26-29):

```typescript
export interface AreaMarkerProps {
  record: FirecallArea;
  selectItem: (item: FirecallItem) => void;
  pane?: string;
}
```

Update the component signature (line 31):

```typescript
export default function AreaMarker({ record, selectItem, pane }: AreaMarkerProps) {
```

Add `pane` prop to the `<Marker>` component (around line 65):

```typescript
          <Marker
            key={index}
            position={p}
            title={record.titleFn()}
            icon={record.icon()}
            draggable={editable}
            autoPan={false}
            pane={pane}
```

Add `pane` prop to the `<Polygon>` component (around line 108):

```typescript
      <Polygon
        positions={positions}
        pane={pane}
        pathOptions={{
```

- [ ] **Step 4: Update `FirecallMultiPoint.renderMarker`**

In `src/components/FirecallItems/elements/FirecallMultiPoint.tsx`, update `renderMarker` (line 135-144) to accept and forward `pane`:

```typescript
  public renderMarker(
    selectItem: (item: FirecallItem) => void,
    options: MarkerRenderOptions = {}
  ): ReactNode {
    try {
      return (
        <ConnectionMarker
          record={this}
          selectItem={selectItem}
          key={this.id}
          pane={options.pane}
        />
      );
    } catch (err) {
      console.error('failed to render marker', err, this.data());
      return <></>;
    }
  }
```

- [ ] **Step 5: Update `ConnectionMarker` component to accept and use `pane`**

In `src/components/FirecallItems/elements/connection/ConnectionComponent.tsx`:

Update the props interface (line 24-27):

```typescript
export interface ConnectionMarkerProps {
  record: FirecallMultiPoint;
  selectItem: (item: FirecallItem) => void;
  pane?: string;
}
```

Update the component signature (line 29-32):

```typescript
export default function ConnectionMarker({
  record,
  selectItem,
  pane,
}: ConnectionMarkerProps) {
```

Add `pane` prop to each `<Marker>` (around line 72):

```typescript
              <Marker
                key={index}
                position={p}
                title={record.titleFn()}
                icon={record.icon()}
                draggable={editable}
                autoPan={false}
                pane={pane}
```

Add `pane` prop to the `<Polyline>` (around line 127):

```typescript
      <Polyline
        positions={positions.filter(([pLat, pLng]) => pLat && pLng)}
        pane={pane}
        pathOptions={{
```

- [ ] **Step 6: Note about `FirecallLine`**

`FirecallLine` extends `FirecallMultiPoint` and does NOT override `renderMarker()`, so it inherits the updated version automatically. No changes needed in `src/components/FirecallItems/elements/FirecallLine.tsx`.

- [ ] **Step 7: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/components/FirecallItems/elements/CircleMarker.tsx \
  src/components/FirecallItems/elements/FirecallArea.tsx \
  src/components/FirecallItems/elements/area/AreaComponent.tsx \
  src/components/FirecallItems/elements/FirecallMultiPoint.tsx \
  src/components/FirecallItems/elements/connection/ConnectionComponent.tsx
git commit -m "feat: thread pane prop through all vector renderers"
```

### Task 6: Update `FirecallItemsLayer` to sort by zIndex and pass pane

**Files:**
- Modify: `src/components/Map/layers/FirecallItemsLayer.tsx`

- [ ] **Step 1: Import `sortByZIndex` and update `renderMarker` call**

Replace `src/components/Map/layers/FirecallItemsLayer.tsx`:

```typescript
import { where } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../../hooks/useFirecall';
import {
  filterDisplayableItems,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../../firebase/firestore';
import { getItemInstance } from '../../FirecallItems/elements';
import ItemOverlay from '../../FirecallItems/ItemOverlay';
import { useHistoryPathSegments } from '../../../hooks/useMapEditor';
import { sortByZIndex } from '../../../hooks/useFirecallLayers';

export interface FirecallLayerOptions {
  layer?: FirecallLayer;
  pane?: string;
}

function renderMarker(
  record: FirecallItem,
  setFirecallItem: (item: FirecallItem) => void,
  pane?: string
) {
  try {
    return getItemInstance(record).renderMarker(setFirecallItem, { pane });
  } catch (err) {
    console.error('Failed to render item ', record, err);
  }
  return <></>;
}

export default function FirecallItemsLayer({
  layer,
  pane,
}: FirecallLayerOptions) {
  const firecallId = useFirecallId();
  const [firecallItem, setFirecallItem] = useState<FirecallItem>();
  const historyPathSegments = useHistoryPathSegments();
  const queryConstraints = useMemo(
    () => (layer?.id ? [where('layer', '==', layer.id)] : []),
    [layer]
  );
  const filterFn = useMemo(
    () =>
      layer?.id
        ? filterDisplayableItems
        : (e: FirecallItem) =>
            (e.layer === undefined || e.layer === '') &&
            filterDisplayableItems(e),
    [layer?.id]
  );

  const records = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn,
  });

  const sortedRecords = useMemo(() => sortByZIndex(records), [records]);

  return (
    <>
      {sortedRecords.map((record) => (
        <React.Fragment key={record.id}>
          <>{renderMarker(record, setFirecallItem, pane)}</>
        </React.Fragment>
      ))}
      {firecallItem && (
        <ItemOverlay
          item={firecallItem}
          close={() => setFirecallItem(undefined)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Map/layers/FirecallItemsLayer.tsx
git commit -m "feat: sort items by zIndex and pass pane to renderers"
```

### Task 7: Update `FirecallLayer` map component to use Panes and sorted layers

**Files:**
- Modify: `src/components/Map/layers/FirecallLayer.tsx`

- [ ] **Step 1: Rewrite `FirecallLayer.tsx` with Pane support**

Replace `src/components/Map/layers/FirecallLayer.tsx`:

```typescript
import { LayerGroup, LayersControl, Pane } from 'react-leaflet';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallItemsLayer from './FirecallItemsLayer';
import FirecallMarker from '../markers/FirecallMarker';
import { useFirecallLayersSorted } from '../../../hooks/useFirecallLayers';
import MarkerClusterLayer from './MarkerClusterLayer';

const PANE_BASE_Z_INDEX = 400;
const DEFAULT_PANE_NAME = 'firecall-default';

export default function FirecallLayer({
  defaultChecked = true,
}: {
  defaultChecked?: boolean;
}) {
  const firecallId = useFirecallId();
  const sortedLayers = useFirecallLayersSorted();

  return (
    <>
      <Pane
        name={DEFAULT_PANE_NAME}
        style={{ zIndex: PANE_BASE_Z_INDEX }}
      >
        <LayersControl.Overlay name="Einsatz" checked={defaultChecked}>
          <LayerGroup>
            {firecallId !== 'unknown' && (
              <>
                <FirecallMarker />
                <FirecallItemsLayer pane={DEFAULT_PANE_NAME} />
              </>
            )}
          </LayerGroup>
        </LayersControl.Overlay>
      </Pane>

      {firecallId !== 'unknown' &&
        sortedLayers.map((layer) => {
          const paneName = `firecall-layer-${layer.id}`;
          const paneZIndex =
            PANE_BASE_Z_INDEX + (layer.zIndex ?? 0) + 1;

          return (
            <Pane
              name={paneName}
              style={{ zIndex: paneZIndex }}
              key={layer.id}
            >
              <LayersControl.Overlay
                name={`Einsatz ${layer.name}`}
                checked={defaultChecked}
              >
                {layer.grouped === 'true' ? (
                  <MarkerClusterLayer
                    summaryPosition={
                      (layer.summaryPosition ||
                        (layer.showSummary !== 'false'
                          ? 'right'
                          : '')) as any
                    }
                    clusterMode={(layer.clusterMode || '') as any}
                  >
                    <FirecallItemsLayer layer={layer} pane={paneName} />
                  </MarkerClusterLayer>
                ) : (
                  <LayerGroup>
                    <FirecallItemsLayer layer={layer} pane={paneName} />
                  </LayerGroup>
                )}
              </LayersControl.Overlay>
            </Pane>
          );
        })}
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Manual test**

Open the app, navigate to a firecall with layers. Verify:
- Default layer items render
- Named layer items render
- No visual regressions

- [ ] **Step 4: Commit**

```bash
git add src/components/Map/layers/FirecallLayer.tsx
git commit -m "feat: use Leaflet Panes for layer-level z-index ordering"
```

---

## Chunk 3: Item Detail Dialog Z-Order Buttons

### Task 8: Add z-order buttons to `FirecallItemDialog`

**Files:**
- Modify: `src/components/FirecallItems/FirecallItemDialog.tsx`

- [ ] **Step 1: Add z-order button imports and update dialog**

Replace `src/components/FirecallItems/FirecallItemDialog.tsx`:

```typescript
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import React, { useCallback, useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import copyAndSaveFirecallItems from '../../hooks/copyLayer';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import { useHistoryPathSegments } from '../../hooks/useMapEditor';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  filterDisplayableItems,
} from '../firebase/firestore';
import { fcItemNames, getItemInstance } from './elements';
import { FirecallItemBase } from './elements/FirecallItemBase';
import FirecallItemFields from './FirecallItemFields';
import { sortByZIndex } from '../../hooks/useFirecallLayers';

export interface FirecallItemDialogOptions {
  onClose: (item?: FirecallItem) => void;
  item?: FirecallItem;
  allowTypeChange?: boolean;
  type?: string;
  autoFocusField?: string;
}

export default function FirecallItemDialog({
  onClose,
  item: itemDefault,
  allowTypeChange = true,
  type: itemType,
  autoFocusField,
}: FirecallItemDialogOptions) {
  const firecallId = useFirecallId();
  const [open, setOpen] = useState(true);
  const [item, setFirecallItem] = useState<FirecallItemBase>(
    getItemInstance({
      type: itemType,
      ...itemDefault,
      datum: itemDefault?.datum || new Date().toISOString(),
    } as FirecallItem)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateItem = useFirecallItemUpdate();
  const historyPathSegments = useHistoryPathSegments();

  // Load siblings for z-order operations (only when editing existing items)
  const layerFilter = item.layer || '';
  const queryConstraints = useMemo(
    () => (layerFilter ? [where('layer', '==', layerFilter)] : []),
    [layerFilter]
  );
  const filterFn = useMemo(
    () =>
      layerFilter
        ? filterDisplayableItems
        : (e: FirecallItem) =>
            (e.layer === undefined || e.layer === '') &&
            filterDisplayableItems(e),
    [layerFilter]
  );
  const siblings = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints,
    pathSegments: [firecallId, ...historyPathSegments, FIRECALL_ITEMS_COLLECTION_ID],
    filterFn,
  });

  const sortedSiblings = useMemo(() => sortByZIndex(siblings), [siblings]);

  const handleZIndexChange = useCallback(
    async (newZIndex: number, swapItem?: FirecallItem) => {
      const updatedItem = { ...item.data(), zIndex: newZIndex };
      await updateItem(updatedItem);
      if (swapItem && swapItem.id) {
        await updateItem({
          ...swapItem,
          zIndex: item.zIndex,
        });
      }
      setFirecallItem((prev) => prev.copy().set('zIndex', newZIndex));
    },
    [item, updateItem]
  );

  const handleBringToFront = useCallback(() => {
    const maxZ = sortedSiblings.length > 0
      ? Math.max(...sortedSiblings.map((s) => s.zIndex ?? 0))
      : 0;
    handleZIndexChange(maxZ + 1);
  }, [sortedSiblings, handleZIndexChange]);

  const handleSendToBack = useCallback(() => {
    const minZ = sortedSiblings.length > 0
      ? Math.min(...sortedSiblings.map((s) => s.zIndex ?? 0))
      : 0;
    handleZIndexChange(minZ - 1);
  }, [sortedSiblings, handleZIndexChange]);

  const handleBringForward = useCallback(() => {
    const currentIndex = sortedSiblings.findIndex((s) => s.id === item.id);
    if (currentIndex < 0 || currentIndex >= sortedSiblings.length - 1) {
      // Already on top or not found — just increment
      handleZIndexChange((item.zIndex ?? 0) + 1);
      return;
    }
    const nextItem = sortedSiblings[currentIndex + 1];
    if ((nextItem.zIndex ?? 0) === (item.zIndex ?? 0)) {
      // Same zIndex — assign current + 1 to differentiate
      handleZIndexChange((item.zIndex ?? 0) + 1);
    } else {
      // Swap with next item
      handleZIndexChange(nextItem.zIndex ?? 0, nextItem);
    }
  }, [sortedSiblings, item, handleZIndexChange]);

  const handleSendBackward = useCallback(() => {
    const currentIndex = sortedSiblings.findIndex((s) => s.id === item.id);
    if (currentIndex <= 0) {
      // Already at bottom or not found — just decrement
      handleZIndexChange((item.zIndex ?? 0) - 1);
      return;
    }
    const prevItem = sortedSiblings[currentIndex - 1];
    if ((prevItem.zIndex ?? 0) === (item.zIndex ?? 0)) {
      // Same zIndex — assign current - 1 to differentiate
      handleZIndexChange((item.zIndex ?? 0) - 1);
    } else {
      // Swap with previous item
      handleZIndexChange(prevItem.zIndex ?? 0, prevItem);
    }
  }, [sortedSiblings, item, handleZIndexChange]);

  const setItemField = (field: string, value: any) => {
    setFirecallItem((prev) => prev.copy().set(field, value));
  };

  const handleChange = (event: SelectChangeEvent) => {
    setFirecallItem((prev) =>
      getItemInstance({ ...prev.data(), type: event.target.value })
    );
  };

  const isExistingItem = !!item.id;

  return (
    <>
      <Dialog open={open} onClose={() => onClose()}>
        <DialogTitle>
          {item.id ? (
            <>{item.markerName()} bearbeiten</>
          ) : (
            <>Neu: {item.markerName()} hinzufügen</>
          )}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>{item.dialogText()}</DialogContentText>
          {allowTypeChange && (
            <FormControl fullWidth variant="standard">
              <InputLabel id="firecall-item-type-label">Element Typ</InputLabel>
              <Select
                labelId="firecall-item-type-label"
                id="firecall-item-type"
                value={item.type}
                label="Art"
                onChange={handleChange}
              >
                {Object.entries(fcItemNames)
                  .filter(([key]) => key !== 'fallback')
                  .map(([key, name]) => (
                    <MenuItem key={key} value={key}>
                      {name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
          <FirecallItemFields
            item={item}
            setItemField={setItemField}
            showLatLng={!!item.id}
            autoFocusField={autoFocusField}
          />
        </DialogContent>
        <DialogActions>
          {isExistingItem && (
            <Box sx={{ display: 'flex', gap: 0.5, mr: 'auto' }}>
              <Tooltip title="Ganz nach hinten">
                <IconButton size="small" onClick={handleSendToBack}>
                  <VerticalAlignBottomIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Nach hinten">
                <IconButton size="small" onClick={handleSendBackward}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Nach vorne">
                <IconButton size="small" onClick={handleBringForward}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Ganz nach vorne">
                <IconButton size="small" onClick={handleBringToFront}>
                  <VerticalAlignTopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
          <Button
            startIcon={<CloseIcon />}
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            Abbrechen
          </Button>
          {item.id && (
            <Button
              startIcon={<ContentCopyIcon />}
              onClick={async () => {
                await copyAndSaveFirecallItems(firecallId, item.filteredData());
                setOpen(false);
                onClose();
              }}
            >
              Kopieren
            </Button>
          )}
          {item.id && (
            <Button
              startIcon={<DeleteIcon />}
              onClick={() => {
                setConfirmDelete(true);
              }}
              color="error"
            >
              Löschen
            </Button>
          )}
          <Button
            color="primary"
            startIcon={item.id ? <SaveIcon /> : <AddIcon />}
            onClick={() => {
              setOpen(false);
              onClose(item.filteredData());
            }}
          >
            {item.id ? 'Aktualisieren' : 'Hinzufügen'}
          </Button>
        </DialogActions>
      </Dialog>
      {confirmDelete && (
        <ConfirmDialog
          title={`${item.title()} löschen`}
          text={`${item.title()} wirklich löschen?`}
          onConfirm={(result) => {
            setConfirmDelete(false);
            if (result) {
              setOpen(false);
              onClose({ ...item.filteredData(), deleted: true });
            }
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Manual test**

Open the app, click on a map object, open its edit dialog. Verify:
- Four z-order buttons appear on the left side of the dialog actions (only for existing items)
- New item dialog does NOT show z-order buttons
- Clicking "Ganz nach vorne" (Bring to Front) saves and the dialog stays open

- [ ] **Step 4: Commit**

```bash
git add src/components/FirecallItems/FirecallItemDialog.tsx
git commit -m "feat: add z-order buttons to item detail dialog"
```

---

## Chunk 4: Layers Page Drag-and-Drop Reordering

### Task 9: Add sortable layer reordering to Layers page

**Files:**
- Modify: `src/components/pages/Layers.tsx`

- [ ] **Step 1: Rewrite `Layers.tsx` with sortable layer cards**

Replace `src/components/pages/Layers.tsx`:

```typescript
'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AddIcon from '@mui/icons-material/Add';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Fab from '@mui/material/Fab';
import Grid, { GridBaseProps } from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { SimpleMap } from '../../common/types';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../hooks/useFirecall';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useFirecallItemUpdate from '../../hooks/useFirecallItemUpdate';
import {
  useFirecallLayers,
  useFirecallLayersSorted,
} from '../../hooks/useFirecallLayers';
import useMapEditor from '../../hooks/useMapEditor';
import FirecallItemCard, {
  FirecallItemCardOptions,
} from '../FirecallItems/FirecallItemCard';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import { getItemInstance } from '../FirecallItems/elements';
import KmlImport from '../firebase/KmlImport';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
  filterDisplayableItems,
} from '../firebase/firestore';

export function DroppableFirecallCard({
  item,
  ...options
}: FirecallItemCardOptions) {
  const { isOver, setNodeRef } = useDroppable({
    id: '' + item.id,
    data: { type: 'layer' as const },
  });
  return (
    <FirecallItemCard
      item={item}
      allowTypeChange={false}
      size={{ xs: 12, md: 12, lg: 12 }}
      cardRef={setNodeRef}
      cardSx={isOver ? {
        outline: '2px solid green',
        outlineOffset: 2,
        backgroundColor: 'rgba(76, 175, 80, 0.04)',
      } : undefined}
      {...options}
    />
  );
}

function SortableLayerCard({
  layer,
  subItems,
}: {
  layer: FirecallLayer;
  subItems: FirecallItem[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: '' + layer.id,
    data: { type: 'layer' as const },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  // Note: useSortable already registers this element as a droppable.
  // Do NOT add a separate useDroppable with the same ID — it would conflict.
  // Item-to-layer drops are handled by DroppableFirecallCard inside.

  return (
    <Grid size={{ xs: 12, md: 12, lg: 12 }}>
      <Box ref={setNodeRef} style={style}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          <Box
            {...attributes}
            {...listeners}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 0.5,
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' },
              color: 'text.secondary',
            }}
          >
            <DragHandleIcon />
          </Box>
          <Box sx={{ flex: 1 }}>
            <DroppableFirecallCard
              item={layer}
              subItems={subItems}
              subItemsDraggable
              compact
              subItemsCompact
            />
          </Box>
        </Box>
      </Box>
    </Grid>
  );
}

function DroppableUnassigned({ items, ...breakpoints }: { items: FirecallItem[] } & GridBaseProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'default',
    data: { type: 'layer' as const },
  });
  return (
    <Grid
      ref={setNodeRef}
      {...breakpoints}
      sx={isOver ? {
        outline: '2px solid green',
        outlineOffset: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(76, 175, 80, 0.04)',
      } : undefined}
    >
      <Typography variant="h5">Elemente nicht zugeordnet</Typography>
      <Grid container spacing={2}>
        {items.map((item) => (
          <FirecallItemCard
            item={item}
            key={item.id}
            draggable
            compact
          />
        ))}
      </Grid>
    </Grid>
  );
}

export default function LayersPage() {
  const { isAuthorized } = useFirebaseLogin();
  const [addDialog, setAddDialog] = useState(false);
  const [activeItem, setActiveItem] = useState<FirecallItem | null>(null);
  const firecallId = useFirecallId();
  const layers = useFirecallLayers();
  const sortedLayers = useFirecallLayersSorted();
  const { historyPathSegments, historyModeActive } = useMapEditor();

  const items = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn: filterDisplayableItems,
  });

  const updateFirecallItem = useFirecallItemUpdate();

  // Layers sorted descending by zIndex for display (top of list = highest z = renders on top)
  const displayLayers = useMemo(
    () => [...sortedLayers].reverse(),
    [sortedLayers]
  );

  const layerIds = useMemo(
    () => displayLayers.map((l) => '' + l.id),
    [displayLayers]
  );

  const layerItems: SimpleMap<FirecallItem[]> = useMemo(() => {
    const elements: SimpleMap<FirecallItem[]> = {};

    Object.assign(
      elements,
      Object.fromEntries(
        Object.keys(layers).map((key) => [
          key,
          items
            .filter((i) => i.layer === key)
            .sort((a, b) => a.datum?.localeCompare(b.datum || '') || 0),
        ])
      )
    );

    elements['default'] = items
      .filter(
        (i) => i.type !== 'layer' && (i.layer === '' || i.layer === undefined)
      )
      .sort((a, b) => a.datum?.localeCompare(b.datum || '') || 0);

    return elements;
  }, [items, layers]);

  const addItem = useFirecallItemAdd();

  const dialogClose = useCallback(
    async (item?: FirecallItem) => {
      if (item) {
        // zIndex auto-assignment is handled by useFirecallItemAdd
        await addItem(item);
      }
      setAddDialog(false);
    },
    [addItem]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const dragType = event.active.data.current?.type;
      if (dragType === 'layer') {
        // Don't show overlay for layer reorder
        setActiveItem(null);
        return;
      }
      const item = items.find((i) => i.id === event.active.id);
      setActiveItem(item || null);
    },
    [items]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null);
      const dragType = event.active.data.current?.type;

      if (dragType === 'layer') {
        // Layer reorder
        const activeId = '' + event.active.id;
        const overId = event.over?.id ? '' + event.over.id : null;
        if (!overId || activeId === overId) return;

        const oldIndex = displayLayers.findIndex(
          (l) => '' + l.id === activeId
        );
        const newIndex = displayLayers.findIndex(
          (l) => '' + l.id === overId
        );
        if (oldIndex < 0 || newIndex < 0) return;

        // Reorder: move item from oldIndex to newIndex
        const reordered = [...displayLayers];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        // Renumber: display is descending, so top of list = highest zIndex
        // index 0 = highest, index N-1 = lowest
        reordered.forEach((layer, idx) => {
          const newZIndex = reordered.length - 1 - idx;
          if ((layer.zIndex ?? 0) !== newZIndex) {
            updateFirecallItem({ ...layer, type: 'layer', zIndex: newZIndex });
          }
        });
        return;
      }

      // Item-to-layer reassignment (existing behavior)
      const layerId = event.over?.id;
      const activeId = event.active.id;
      console.info(`FirecallItem drag end ${activeId} on to ${layerId}`);
      const item = items.find((i) => i.id === activeId);
      if (layerId && activeId && item) {
        updateFirecallItem({
          ...item,
          layer: layerId === 'default' ? undefined : '' + layerId,
        });
      }
    },
    [items, displayLayers, updateFirecallItem]
  );

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 5,
    },
  });
  const keyboardSensor = useSensor(KeyboardSensor);

  const sensors = useSensors(
    mouseSensor,
    touchSensor,
    keyboardSensor
  );

  if (typeof window === 'undefined') {
    return '<div>Loading</div>';
  }

  if (!isAuthorized) {
    return <></>;
  }

  const hasUnassignedItems = layerItems['default'].length > 0;

  return (
    <>
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} sensors={sensors}>
        <Box sx={{ p: 2, m: 2 }}>
          <Typography variant="h3" gutterBottom>
            Ebenen {!historyModeActive && <KmlImport />}
          </Typography>
          <Grid container spacing={2}>
            <Grid
              size={hasUnassignedItems ? { xs: 12, md: 7, xl: 8 } : { xs: 12, xl: 10 }}
            >
              <Typography variant="h5">
                Erstellte Ebenen
              </Typography>
              <SortableContext
                items={layerIds}
                strategy={verticalListSortingStrategy}
              >
                <Grid container spacing={2}>
                  {displayLayers.map((layer) => (
                    <SortableLayerCard
                      key={layer.id}
                      layer={layer}
                      subItems={layerItems[layer.id!] || []}
                    />
                  ))}
                </Grid>
              </SortableContext>
            </Grid>
            <DroppableUnassigned
              size={hasUnassignedItems ? { xs: 12, md: 5, xl: 4 } : { xs: 12, xl: 2 }}
              items={layerItems['default']}
            />
          </Grid>
        </Box>
        {!historyModeActive && (
          <Fab
            color="primary"
            aria-label="add"
            sx={{ position: 'fixed', bottom: 16, right: 16 }}
            onClick={() => setAddDialog(true)}
          >
            <AddIcon />
          </Fab>
        )}
        {addDialog && (
          <FirecallItemDialog
            type="layer"
            onClose={dialogClose}
            allowTypeChange={false}
          />
        )}
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <Card sx={{ opacity: 0.9, maxWidth: 300 }}>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body1" noWrap>
                  {getItemInstance(activeItem).title()}
                </Typography>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Manual test**

Open the app, navigate to the Layers page. Verify:
- Layers appear sorted by zIndex (highest at top)
- Drag handle icon appears next to each layer card
- Dragging a layer card up/down reorders layers
- Dragging an item card onto a layer still reassigns it
- Newly created layers appear at the top

- [ ] **Step 4: Commit**

```bash
git add src/components/pages/Layers.tsx
git commit -m "feat: add drag-and-drop layer reordering on Layers page"
```

---

## Chunk 5: Final Verification

### Task 10: Full build and lint verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: No new lint errors

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build with no errors

- [ ] **Step 3: Commit any lint fixes if needed**

```bash
git add -u
git commit -m "fix: lint fixes for z-index ordering feature"
```
