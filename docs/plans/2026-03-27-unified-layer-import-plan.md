# Unified Layer Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Combine KML, CSV, and GPX import into a single unified import component with file-type detection.

**Architecture:** Extract shared GeoJSON→FirecallItem logic from KmlImport into `geoJsonImport.ts`. Add GPX parsing via existing `@mapbox/togeojson`. Create unified `LayerImport.tsx` that detects file type and shows format-specific UI sections.

**Tech Stack:** React, MUI, @mapbox/togeojson (kml + gpx), existing csvParser

---

### Task 1: Extract shared GeoJSON import logic

**Files:**
- Create: `src/components/firebase/geoJsonImport.ts`
- Create: `src/components/firebase/geoJsonImport.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { generateSchemaFromFeatures, parseGeoJson, TYPE_LABELS, STYLE_PROPERTIES } from './geoJsonImport';

const pointFeatures = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [16.848, 47.948, 5.36] },
      properties: { name: 'WP1', elevation: 123, fill: '#ff0000', styleUrl: '#style1' },
    },
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [16.849, 47.949, 10.2] },
      properties: { name: 'WP2', elevation: 456 },
    },
  ],
};

const lineFeatures = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [16.848, 47.948, 5],
          [16.849, 47.949, 10],
          [16.850, 47.950, 15],
        ],
      },
      properties: { name: 'Track 1' },
    },
  ],
};

describe('generateSchemaFromFeatures', () => {
  it('excludes style properties and name', () => {
    const { schema } = generateSchemaFromFeatures(pointFeatures.features);
    const keys = schema.map((s) => s.key);
    expect(keys).toContain('elevation');
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('fill');
    expect(keys).not.toContain('styleUrl');
  });

  it('infers numeric type for number values', () => {
    const { schema } = generateSchemaFromFeatures(pointFeatures.features);
    const elevation = schema.find((s) => s.key === 'elevation');
    expect(elevation?.type).toBe('number');
  });

  it('returns headerToSchemaKey mapping', () => {
    const { headerToSchemaKey } = generateSchemaFromFeatures(pointFeatures.features);
    expect(headerToSchemaKey.get('elevation')).toBe('elevation');
  });
});

describe('parseGeoJson', () => {
  it('converts Point features to marker items', () => {
    const { schema, headerToSchemaKey } = generateSchemaFromFeatures(pointFeatures.features);
    const items = parseGeoJson(pointFeatures, schema, headerToSchemaKey);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('marker');
    expect(items[0].name).toBe('WP1');
    expect(items[0].lat).toBeCloseTo(47.948);
    expect(items[0].lng).toBeCloseTo(16.848);
  });

  it('converts LineString features to line items', () => {
    const { schema, headerToSchemaKey } = generateSchemaFromFeatures(lineFeatures.features);
    const items = parseGeoJson(lineFeatures, schema, headerToSchemaKey);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('line');
    expect(items[0].name).toBe('Track 1');
    expect((items[0] as any).positions).toBeDefined();
    expect((items[0] as any).destLat).toBeCloseTo(47.950);
    expect((items[0] as any).destLng).toBeCloseTo(16.850);
  });

  it('uses index-based name when name property is missing', () => {
    const noNameFeatures = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [16.848, 47.948] },
          properties: {},
        },
      ],
    };
    const { schema, headerToSchemaKey } = generateSchemaFromFeatures(noNameFeatures.features);
    const items = parseGeoJson(noNameFeatures, schema, headerToSchemaKey);
    expect(items[0].name).toBe('1');
  });
});

describe('TYPE_LABELS', () => {
  it('has labels for Point, LineString, Polygon', () => {
    expect(TYPE_LABELS.Point).toBe('Punkte');
    expect(TYPE_LABELS.LineString).toBe('Linien');
    expect(TYPE_LABELS.Polygon).toBe('Flächen');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/firebase/geoJsonImport.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Extract from `KmlImport.tsx` into `geoJsonImport.ts`:
- `TYPE_LABELS`
- `STYLE_PROPERTIES` (renamed from `KML_STYLE_PROPERTIES` — applies to both KML and GPX)
- `generateSchemaFromFeatures()`
- `parseGeoJson()`
- `GeoJsonFeatureCollection` type (fix the typo from `Colleaction`)
- `KmlGeoProperties` type

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/firebase/geoJsonImport.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: extract shared GeoJSON import logic into geoJsonImport.ts
```

---

### Task 2: Add GPX parser

**Files:**
- Create: `src/components/firebase/gpxParser.ts`
- Create: `src/components/firebase/gpxParser.test.ts`

**Step 1: Write the test**

Use the example GPX from `examples/RadiaCode_Track.xml` as test input. Test that:
- GPX track is converted to GeoJSON FeatureCollection
- Features have LineString geometry with correct coordinates
- Track name is preserved

```typescript
import { describe, it, expect } from 'vitest';
import { parseGpxFile } from './gpxParser';

const SIMPLE_GPX = `<?xml version="1.0" encoding="utf-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
<trk>
<name>Test Track</name>
<trkseg>
<trkpt lat="47.948" lon="16.848"><ele>5.36</ele><time>2026-03-27T07:48:09Z</time></trkpt>
<trkpt lat="47.949" lon="16.849"><ele>10.2</ele><time>2026-03-27T07:48:10Z</time></trkpt>
</trkseg>
</trk>
<wpt lat="47.950" lon="16.850"><name>Waypoint 1</name><ele>100</ele></wpt>
<rte>
<name>Test Route</name>
<rtept lat="47.951" lon="16.851"><ele>50</ele></rtept>
<rtept lat="47.952" lon="16.852"><ele>60</ele></rtept>
</rte>
</gpx>`;

describe('parseGpxFile', () => {
  it('parses tracks as LineString features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const lines = result.geoJson.features.filter((f) => f.geometry.type === 'LineString');
    expect(lines.length).toBeGreaterThanOrEqual(1);
    // Track should have name
    const track = lines.find((f) => f.properties.name === 'Test Track');
    expect(track).toBeDefined();
  });

  it('parses waypoints as Point features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const points = result.geoJson.features.filter((f) => f.geometry.type === 'Point');
    expect(points.length).toBeGreaterThanOrEqual(1);
    const wp = points.find((f) => f.properties.name === 'Waypoint 1');
    expect(wp).toBeDefined();
  });

  it('parses routes as LineString features', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    const lines = result.geoJson.features.filter((f) => f.geometry.type === 'LineString');
    const route = lines.find((f) => f.properties.name === 'Test Route');
    expect(route).toBeDefined();
  });

  it('derives layer name from filename', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'RadiaCode_Track.gpx');
    expect(result.layerName).toBe('RadiaCode_Track');
  });

  it('generates schema from feature properties', () => {
    const result = parseGpxFile(SIMPLE_GPX, 'test.gpx');
    expect(result.schema).toBeDefined();
    expect(result.headerToSchemaKey).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/firebase/gpxParser.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import { gpx as toGeoJSON } from '@mapbox/togeojson';
import { generateSchemaFromFeatures, GeoJsonFeatureCollection } from './geoJsonImport';
import { DataSchemaField } from './firestore';

export interface GpxPreviewState {
  geoJson: GeoJsonFeatureCollection;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

export function parseGpxFile(gpxText: string, fileName: string): GpxPreviewState {
  const dom = new DOMParser().parseFromString(gpxText, 'text/xml');
  const geoJson: GeoJsonFeatureCollection = toGeoJSON(dom);
  const { schema, headerToSchemaKey } = generateSchemaFromFeatures(geoJson.features);
  const layerName = fileName.replace(/\.gpx$/i, '');
  return { geoJson, schema, headerToSchemaKey, layerName };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/firebase/gpxParser.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add GPX parser with track, waypoint, and route support
```

---

### Task 3: Create unified LayerImport component

**Files:**
- Create: `src/components/firebase/LayerImport.tsx`
- Modify: `src/components/pages/Layers.tsx`

**Step 1: Create LayerImport.tsx**

Unified component that:
1. Has a single "Importieren" button accepting `.kml,.gpx,.csv,.tsv,.txt`
2. On file select, detects type by extension
3. Parses using the appropriate parser (KML/GPX → geoJsonImport, CSV → csvParser)
4. Shows a preview dialog with:
   - Common: layer name, type chips, schema editor, import button
   - CSV-only: delimiter, header row, column mapping, extra columns, downsampling
5. On import, creates layer + items via `useFirecallItemAdd`

The component combines the logic from KmlImport and CsvImport into a single file. Use a discriminated union for the preview state:

```typescript
type ImportFormat = 'kml' | 'gpx' | 'csv';

interface GeoJsonPreviewState {
  format: 'kml' | 'gpx';
  geoJson: GeoJsonFeatureCollection;
  schema: DataSchemaField[];
  headerToSchemaKey: Map<string, string>;
  layerName: string;
}

interface CsvPreviewState {
  format: 'csv';
  // ... all existing CsvImport state fields
}

type PreviewState = GeoJsonPreviewState | CsvPreviewState;
```

**Step 2: Update Layers.tsx**

Replace:
```tsx
import CsvImport from '../firebase/CsvImport';
import KmlImport from '../firebase/KmlImport';
// ...
Ebenen {!historyModeActive && <><KmlImport /><CsvImport /></>}
```

With:
```tsx
import LayerImport from '../firebase/LayerImport';
// ...
Ebenen {!historyModeActive && <LayerImport />}
```

**Step 3: Run build and existing tests**

Run: `npm run check`
Expected: PASS

**Step 4: Commit**

```
feat: unified layer import with GPX support

Combines KML, CSV, and GPX import into a single "Importieren" button.
File type is auto-detected by extension. GPX files support tracks,
routes, and waypoints.
```

---

### Task 4: Delete old import components

**Files:**
- Delete: `src/components/firebase/KmlImport.tsx`
- Delete: `src/components/firebase/CsvImport.tsx`

**Step 1: Verify no other imports of KmlImport or CsvImport exist**

Run: `grep -r "KmlImport\|CsvImport" src/ --include="*.tsx" --include="*.ts"`
Should only show the old files themselves (already replaced in Layers.tsx).

**Step 2: Delete the files**

**Step 3: Run check**

Run: `npm run check`
Expected: PASS

**Step 4: Commit**

```
refactor: remove old KmlImport and CsvImport components
```
