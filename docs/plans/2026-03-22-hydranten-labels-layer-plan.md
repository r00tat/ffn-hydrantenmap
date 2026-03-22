# Hydranten Labels Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable "Hydranten Infos" map overlay that permanently displays hydrant information labels using existing cluster data.

**Architecture:** New `HydrantenLabelsLayer` component renders invisible `CircleMarker`s with permanent Leaflet `Tooltip`s. Integrated into `Clusters.tsx` as a new `LayersControl.Overlay` directly after "Hydranten". Default unchecked.

**Tech Stack:** React, react-leaflet (CircleMarker, Tooltip, LayersControl, LayerGroup), TypeScript

---

### Task 1: Create HydrantenLabelsLayer Component

**Files:**
- Create: `src/components/Map/layers/HydrantenLabelsLayer.tsx`

**Step 1: Write the component**

```tsx
import Typography from '@mui/material/Typography';
import { CircleMarker, LayerGroup, Tooltip } from 'react-leaflet';
import { HydrantenRecord } from '../../../common/gis-objects';

export interface HydrantenLabelsLayerProps {
  hydranten: HydrantenRecord[];
}

function formatLabel(h: HydrantenRecord): string[] {
  const lines: string[] = [h.name];
  const leistung = h.leistung ? `${h.leistung} l/min` : '';
  const dimension = h.dimension ? `(${h.dimension}mm)` : '';
  const flow = [leistung, dimension].filter(Boolean).join(' ');
  if (flow) lines.push(flow);
  if (h.dynamischer_druck) lines.push(`${h.dynamischer_druck} bar dyn.`);
  if (h.leitungsart) lines.push(h.leitungsart);
  return lines;
}

export default function HydrantenLabelsLayer({
  hydranten,
}: HydrantenLabelsLayerProps) {
  return (
    <LayerGroup>
      {hydranten.map((h) => (
        <CircleMarker
          key={h.name}
          center={[h.lat, h.lng]}
          radius={0}
          interactive={false}
          stroke={false}
          fill={false}
        >
          <Tooltip
            direction="bottom"
            permanent
            offset={[0, 10]}
            opacity={0.8}
            className="nopadding"
          >
            <Typography variant="caption" component="div">
              {formatLabel(h).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </Typography>
          </Tooltip>
        </CircleMarker>
      ))}
    </LayerGroup>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Map/layers/HydrantenLabelsLayer.tsx
git commit -m "feat: add HydrantenLabelsLayer component with permanent tooltip labels"
```

---

### Task 2: Write Test for formatLabel

**Files:**
- Create: `src/components/Map/layers/HydrantenLabelsLayer.test.ts`
- Modify: `src/components/Map/layers/HydrantenLabelsLayer.tsx` (export `formatLabel`)

**Step 1: Export formatLabel from HydrantenLabelsLayer**

In `src/components/Map/layers/HydrantenLabelsLayer.tsx`, change:

```tsx
function formatLabel(h: HydrantenRecord): string[] {
```

to:

```tsx
export function formatLabel(h: HydrantenRecord): string[] {
```

**Step 2: Write the test**

```ts
import { describe, expect, it } from 'vitest';
import { HydrantenRecord } from '../../../common/gis-objects';
import { formatLabel } from './HydrantenLabelsLayer';

const baseHydrant: HydrantenRecord = {
  name: 'Hauptplatz 3',
  lat: 47.9,
  lng: 16.8,
  ortschaft: 'Neusiedl',
  typ: 'Überflurhydrant',
  hydranten_nummer: '123',
  fuellhydrant: 'nein',
  dimension: 80,
  leitungsart: 'Transportleitung',
  statischer_druck: 5,
  dynamischer_druck: 3.5,
  druckmessung_datum: '2020-01-01',
  meereshoehe: 130,
  geohash: 'u2edk5',
  leistung: '1500',
};

describe('formatLabel', () => {
  it('shows all fields when present', () => {
    const lines = formatLabel(baseHydrant);
    expect(lines).toEqual([
      'Hauptplatz 3',
      '1500 l/min (80mm)',
      '3.5 bar dyn.',
      'Transportleitung',
    ]);
  });

  it('omits leistung line when leistung is missing', () => {
    const h = { ...baseHydrant, leistung: undefined, dimension: 0 };
    const lines = formatLabel(h);
    expect(lines).toEqual(['Hauptplatz 3', '3.5 bar dyn.', 'Transportleitung']);
  });

  it('omits dynamic pressure when zero', () => {
    const h = { ...baseHydrant, dynamischer_druck: 0 };
    const lines = formatLabel(h);
    expect(lines).not.toContain('0 bar dyn.');
  });

  it('omits leitungsart when empty', () => {
    const h = { ...baseHydrant, leitungsart: '' };
    const lines = formatLabel(h);
    expect(lines).not.toContain('');
    expect(lines).toHaveLength(3);
  });

  it('shows dimension only when leistung is missing', () => {
    const h = { ...baseHydrant, leistung: undefined };
    const lines = formatLabel(h);
    expect(lines[1]).toBe('(80mm)');
  });
});
```

**Step 3: Run test to verify it passes**

Run: `npm run test -- --run src/components/Map/layers/HydrantenLabelsLayer.test.ts`
Expected: All 5 tests PASS

**Step 4: Commit**

```bash
git add src/components/Map/layers/HydrantenLabelsLayer.tsx src/components/Map/layers/HydrantenLabelsLayer.test.ts
git commit -m "test: add formatLabel unit tests for hydrant labels"
```

---

### Task 3: Integrate into Clusters.tsx

**Files:**
- Modify: `src/components/Map/Clusters.tsx`

**Step 1: Add import**

At line 23 of `src/components/Map/Clusters.tsx`, add:

```tsx
import HydrantenLabelsLayer from './layers/HydrantenLabelsLayer';
```

**Step 2: Add new overlay after the Hydranten overlay**

In the `Clusters` component's return JSX, after the existing Hydranten overlay (line 207), add:

```tsx
      <LayersControl.Overlay name="Hydranten Infos" checked={false}>
        <HydrantenLabelsLayer hydranten={hydranten} />
      </LayersControl.Overlay>
```

The result should look like:

```tsx
      <LayersControl.Overlay name="Hydranten" checked={defaultChecked?.hydranten ?? true}>
        <HydrantenLayer hydranten={hydranten} clustered={clustered} summaryPosition="hover" />
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Hydranten Infos" checked={false}>
        <HydrantenLabelsLayer hydranten={hydranten} />
      </LayersControl.Overlay>
      <LayersControl.Overlay name="Saugstellen" checked={defaultChecked?.saugstellen ?? true}>
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds without errors

**Step 4: Commit**

```bash
git add src/components/Map/Clusters.tsx
git commit -m "feat: add Hydranten Infos overlay to map layer control"
```

---

### Task 4: Manual Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Verify in browser**

1. Open the map in the browser
2. Open the layer control (top right)
3. Verify "Hydranten Infos" appears directly below "Hydranten"
4. Verify it is unchecked by default
5. Enable it — permanent labels should appear at each hydrant position
6. Labels should show: Name, Leistung+Dimension, dynamischer Druck, Leitungsart
7. Disable it — labels should disappear
8. Verify the regular Hydranten layer with popups still works independently
