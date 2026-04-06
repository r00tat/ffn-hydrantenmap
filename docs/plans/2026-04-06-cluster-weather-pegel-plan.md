# Geohash-Cluster für Wetterstationen & Pegelstände - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wetterstationen und Pegelstände in die bestehende `clusters6` Geohash-Cluster-Struktur integrieren. Stationspositionen kommen gratis mit dem Cluster-Query; Live-Daten werden erst per Server Action geladen, wenn der Layer eingeblendet wird.

**Architecture:** `GeohashCluster` in `gis-objects.ts` um `wetterstationen[]` und `pegelstaende[]` erweitern. `useClusters()` liefert die Metadaten. Layer-Komponenten nutzen `overlayadd`/`overlayremove` Events (wie PowerOutageLayer) um bei Sichtbarkeit Live-Daten per Server Action mit Station-IDs zu holen. Cluster-Import (API-Route + CLI-Script) wird um die neuen Datenquellen erweitert.

**Tech Stack:** TypeScript, React, Leaflet, Firebase Firestore, Next.js Server Actions, GeoSphere API, Pegelstand-Scraping

---

### Task 1: GeohashCluster-Typen erweitern

**Files:**
- Modify: `src/common/gis-objects.ts:77-86`

**Step 1: Write the failing test**

Create `src/common/gis-objects.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { GeohashCluster, WetterstationRecord, PegelstandRecord } from './gis-objects';

describe('GeohashCluster types', () => {
  it('should accept wetterstationen array', () => {
    const station: WetterstationRecord = {
      id: 'tawes-123',
      name: 'Neusiedl am See',
      lat: 47.948,
      lng: 16.848,
      altitude: 132,
      state: 'Burgenland',
    };
    const cluster: GeohashCluster = {
      geohash: 'u2ebzt',
      wetterstationen: [station],
    };
    expect(cluster.wetterstationen).toHaveLength(1);
    expect(cluster.wetterstationen![0].altitude).toBe(132);
  });

  it('should accept pegelstaende array', () => {
    const pegel: PegelstandRecord = {
      id: 'bgld-wulka',
      name: 'Wulka',
      lat: 47.85,
      lng: 16.52,
      type: 'river',
      source: 'bgld',
      detailUrl: '/hydrographie/die-fluesse/wulka',
    };
    const cluster: GeohashCluster = {
      geohash: 'u2ebzt',
      pegelstaende: [pegel],
    };
    expect(cluster.pegelstaende).toHaveLength(1);
    expect(cluster.pegelstaende![0].source).toBe('bgld');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd .worktrees/feat/cluster-weather-pegel && NO_COLOR=1 npx vitest run src/common/gis-objects.test.ts`
Expected: FAIL — `WetterstationRecord` and `PegelstandRecord` not exported

**Step 3: Write minimal implementation**

Add to `src/common/gis-objects.ts` before `GeohashCluster`:

```typescript
export interface WetterstationRecord extends WgsObject {
  altitude: number;
  state: string;
}

export interface PegelstandRecord extends WgsObject {
  type: 'river' | 'lake';
  source: 'bgld' | 'noe' | 'stmk';
  detailUrl: string;
  rivername?: string;
}
```

Add to `GeohashCluster` interface:

```typescript
wetterstationen?: WetterstationRecord[];
pegelstaende?: PegelstandRecord[];
```

**Step 4: Run test to verify it passes**

Run: `cd .worktrees/feat/cluster-weather-pegel && NO_COLOR=1 npx vitest run src/common/gis-objects.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/common/gis-objects.ts src/common/gis-objects.test.ts
git commit -m "feat: GeohashCluster um WetterstationRecord und PegelstandRecord erweitern"
```

---

### Task 2: useClusters() um Wetterstationen und Pegelstände erweitern

**Files:**
- Modify: `src/components/Map/Clusters.tsx:83-155`

**Step 1: Add new fields to ClusterData and useClusters**

In `Clusters.tsx`, add imports:
```typescript
import {
  // ... existing imports
  WetterstationRecord,
  PegelstandRecord,
} from '../../common/gis-objects';
```

Extend `ClusterData` interface:
```typescript
interface ClusterData {
  clusters: GeohashCluster[];
  hydranten: HydrantenRecord[];
  risikoobjekte: RisikoObjekt[];
  gefahrObjekte: GefahrObjekt[];
  loeschteiche: Loeschteich[];
  saugstellen: Saugstelle[];
  wetterstationen: WetterstationRecord[];
  pegelstaende: PegelstandRecord[];
}
```

Add to `useClusters()` initial state:
```typescript
wetterstationen: [],
pegelstaende: [],
```

Add filtering after `saugstellen`:
```typescript
const wetterstationen = filterRecords<WetterstationRecord>(
  matchingDocs,
  'wetterstationen',
  center,
  radiusInM
);
const pegelstaende = filterRecords<PegelstandRecord>(
  matchingDocs,
  'pegelstaende',
  center,
  radiusInM
);
```

Add to `setClusterData`:
```typescript
wetterstationen,
pegelstaende,
```

**Step 2: Pass new data to Clusters component**

In the `Clusters` component, destructure the new fields:
```typescript
const { hydranten, gefahrObjekte, risikoobjekte, loeschteiche, saugstellen, wetterstationen, pegelstaende } =
    useClusters(center, radius * 2);
```

No rendering changes needed here — the layer components will consume the data via props.

**Step 3: Run tests**

Run: `cd .worktrees/feat/cluster-weather-pegel && NO_COLOR=1 npx vitest run`
Expected: PASS (no breaking changes)

**Step 4: Commit**

```bash
git add src/components/Map/Clusters.tsx
git commit -m "feat: useClusters() liefert wetterstationen und pegelstaende aus Cluster-Daten"
```

---

### Task 3: WetterstationLayer refactoren — Positionen aus Clustern, Live-Daten per Server Action

**Files:**
- Create: `src/components/Map/layers/WetterstationAction.ts`
- Modify: `src/components/Map/layers/WetterstationLayer.tsx`

**Step 1: Create Server Action for live data**

Create `src/components/Map/layers/WetterstationAction.ts`:

```typescript
'use server';

import { actionUserRequired } from '../../../app/auth';

export interface WetterstationLiveData {
  stationId: string;
  timestamp: string;
  temperature: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: number | null;
  humidity: number | null;
  pressure: number | null;
  precipitation: number | null;
  snowDepth: number | null;
  sunshine: number | null;
  solarRadiation: number | null;
}

const DATA_URL =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min';
const PARAMETERS = 'TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW';

interface ParameterValue {
  name: string;
  unit: string;
  data: (number | null)[];
}

interface TawesFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    station: string;
    parameters: Record<string, ParameterValue>;
  };
}

interface TawesGeoJSON {
  type: 'FeatureCollection';
  timestamps: string[];
  features: TawesFeature[];
}

function getParamValue(
  params: Record<string, ParameterValue>,
  key: string
): number | null {
  const p = params[key];
  if (!p?.data?.length) return null;
  for (let i = p.data.length - 1; i >= 0; i--) {
    if (p.data[i] !== null) return p.data[i];
  }
  return null;
}

export async function fetchWetterstationLiveData(
  stationIds: string[]
): Promise<WetterstationLiveData[]> {
  await actionUserRequired();

  if (stationIds.length === 0) return [];

  try {
    const ids = stationIds.join(',');
    const url = `${DATA_URL}?parameters=${PARAMETERS}&station_ids=${ids}&output_format=geojson`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) {
      console.error(`TAWES data fetch failed: ${response.status}`);
      return [];
    }

    const geojson: TawesGeoJSON = await response.json();
    const lastIndex =
      geojson.timestamps?.length > 0 ? geojson.timestamps.length - 1 : -1;
    const timestamp = lastIndex >= 0 ? geojson.timestamps[lastIndex] : '';

    return geojson.features.map((feature) => {
      const params = feature.properties.parameters;
      return {
        stationId: feature.properties.station,
        timestamp,
        temperature: getParamValue(params, 'TL'),
        windSpeed: getParamValue(params, 'FF'),
        windGust: getParamValue(params, 'FFX'),
        windDirection: getParamValue(params, 'DD'),
        humidity: getParamValue(params, 'RF'),
        pressure: getParamValue(params, 'P'),
        precipitation: getParamValue(params, 'RR'),
        snowDepth: getParamValue(params, 'SCHNEE'),
        sunshine: getParamValue(params, 'SO'),
        solarRadiation: getParamValue(params, 'GLOW'),
      };
    });
  } catch (error) {
    console.error('Failed to fetch Wetterstation live data:', error);
    return [];
  }
}
```

**Step 2: Refactor WetterstationLayer**

Rewrite `WetterstationLayer.tsx` to:
1. Accept `wetterstationen` prop (from clusters) instead of fetching metadata
2. Use `overlayadd`/`overlayremove` pattern (from PowerOutageLayer) to detect visibility
3. Fetch live data via `fetchWetterstationLiveData()` only when visible
4. Keep existing icon/popup rendering logic

Key changes:
- Remove `useWetterstationData()` hook (metadata fetch + data fetch combined)
- Add `visible` state with map event listeners (like PowerOutageLayer)
- New hook fetches live data when visible, using station IDs from cluster prop
- Merge cluster metadata (name, altitude, lat, lng) with live data (temperature etc.)

Props interface:
```typescript
interface WetterstationLayerProps {
  wetterstationen: WetterstationRecord[];
}
```

**Step 3: Run type check and tests**

Run: `cd .worktrees/feat/cluster-weather-pegel && npx tsc --noEmit && NO_COLOR=1 npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Map/layers/WetterstationAction.ts src/components/Map/layers/WetterstationLayer.tsx
git commit -m "feat: WetterstationLayer nutzt Cluster-Positionen und lädt Live-Daten per Server Action"
```

---

### Task 4: PegelstandLayer refactoren — Positionen aus Clustern, Live-Daten bei Sichtbarkeit

**Files:**
- Modify: `src/components/Map/layers/PegelstandLayer.tsx`
- Modify: `src/components/Map/layers/PegelstandAction.ts`

**Step 1: Add station-filtered Server Action**

Add to `PegelstandAction.ts` a new exported function:

```typescript
export async function fetchPegelstandLiveData(
  stations: { id: string; source: string }[]
): Promise<PegelstandData[]> {
  await actionUserRequired();
  // Fetch all data (HTML scraping returns everything anyway)
  // Then filter to requested station IDs
  const allData = await fetchAllPegelstandData();
  const requestedIds = new Set(stations.map((s) => s.id));
  return allData.filter((d) => requestedIds.has(d.slug));
}
```

Extract the inner fetch logic from `fetchPegelstandData()` into a private `fetchAllPegelstandData()` function (without the auth check, since the public wrapper handles it).

**Step 2: Refactor PegelstandLayer**

Rewrite `PegelstandLayer.tsx` to:
1. Accept `pegelstaende` prop (from clusters)
2. Use `overlayadd`/`overlayremove` for visibility detection
3. Fetch live data via `fetchPegelstandLiveData()` only when visible
4. Remove `useFirebaseCollection` for `pegelstand_stations` (coordinates now in clusters)
5. Keep existing icon/popup rendering logic

Props interface:
```typescript
interface PegelstandLayerProps {
  pegelstaende: PegelstandRecord[];
}
```

**Step 3: Run type check and tests**

Run: `cd .worktrees/feat/cluster-weather-pegel && npx tsc --noEmit && NO_COLOR=1 npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Map/layers/PegelstandLayer.tsx src/components/Map/layers/PegelstandAction.ts
git commit -m "feat: PegelstandLayer nutzt Cluster-Positionen und lädt Live-Daten per Server Action"
```

---

### Task 5: Map.tsx und Clusters.tsx — Props durchreichen

**Files:**
- Modify: `src/components/Map/Clusters.tsx:157-226`
- Modify: `src/components/Map/Map.tsx:125-140`

**Step 1: Update Clusters component**

Pass `wetterstationen` and `pegelstaende` as props to the layer components via render:

```typescript
<LayersControl.Overlay name="Pegelstände">
  <PegelstandLayer pegelstaende={pegelstaende} />
</LayersControl.Overlay>
<LayersControl.Overlay name="Wetterstationen">
  <WetterstationLayer wetterstationen={wetterstationen} />
</LayersControl.Overlay>
```

Add imports for WetterstationLayer and PegelstandLayer in Clusters.tsx.

**Step 2: Remove standalone layer registration from Map.tsx**

Remove lines 135-140 (standalone PegelstandLayer and WetterstationLayer in Map.tsx).
Remove unused imports.

**Step 3: Run type check and tests**

Run: `cd .worktrees/feat/cluster-weather-pegel && npx tsc --noEmit && NO_COLOR=1 npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/Map/Clusters.tsx src/components/Map/Map.tsx
git commit -m "feat: Wetter- und Pegel-Layer in Clusters-Komponente integriert"
```

---

### Task 6: Cluster-Import erweitern — Wetterstationen und Pegelstände

**Files:**
- Modify: `src/app/api/admin/update-clusters/route.ts`
- Modify: `src/server/cluster-import.ts`

**Step 1: Add Wetterstation import to update-clusters API route**

After the existing collection loop (Step 1), add a new section:

```typescript
// Fetch Wetterstation metadata from GeoSphere
send({ step: 1, status: 'in_progress', message: 'Fetching Wetterstationen...' });
const metaResponse = await fetch(
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata'
);
if (metaResponse.ok) {
  const metadata = await metaResponse.json();
  const stations = metadata.stations.filter((s: any) =>
    s.is_active && (s.state === 'Burgenland' ||
      (s.lat >= 46.8 && s.lat <= 48.2 && s.lon >= 15.8 && s.lon <= 17.2))
  );
  for (const station of stations) {
    const hash = geohashForLocation([station.lat, station.lon], GEOHASH_PRECISION);
    if (!geohashes[hash]) {
      geohashes[hash] = { hydranten: [], geohash: hash };
    }
    if (!geohashes[hash].wetterstationen) {
      geohashes[hash].wetterstationen = [];
    }
    const record = {
      id: station.id,
      name: station.name,
      lat: station.lat,
      lng: station.lon,
      altitude: station.altitude,
      state: station.state,
    };
    const existing = geohashes[hash].wetterstationen!.find((w) => w.id === station.id);
    if (existing) {
      Object.assign(existing, record);
    } else {
      geohashes[hash].wetterstationen!.push(record);
    }
  }
}
```

**Step 2: Add Pegelstand import**

Similar pattern:
- Fetch Bgld station coordinates from Firestore `pegelstand_stations`
- Fetch NÖ data from MapList.json (for coordinates)
- Fetch Stmk data from HyDaVis (for coordinates)
- Generate geohash for each and add to clusters

**Step 3: Update CLI script (`cluster-import.ts`)**

Add the same logic to the CLI script for consistency.

**Step 4: Run type check**

Run: `cd .worktrees/feat/cluster-weather-pegel && npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/admin/update-clusters/route.ts src/server/cluster-import.ts
git commit -m "feat: Cluster-Import um Wetterstationen und Pegelstände erweitern"
```

---

### Task 7: LocationMapPicker aktualisieren

**Files:**
- Modify: `src/components/Einsatzorte/LocationMapPicker.tsx`

**Step 1: Check if LocationMapPicker uses WetterstationLayer/PegelstandLayer directly**

If it imports them standalone, update to pass empty arrays as props (LocationMapPicker doesn't use clusters).

**Step 2: Run type check**

Run: `cd .worktrees/feat/cluster-weather-pegel && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit if changes needed**

```bash
git add src/components/Einsatzorte/LocationMapPicker.tsx
git commit -m "fix: LocationMapPicker an neue Layer-Props anpassen"
```

---

### Task 8: Full check & Final verification

**Step 1: Run full check**

Run: `cd .worktrees/feat/cluster-weather-pegel && npm run check`
Expected: tsc, lint, tests, build all PASS

**Step 2: Fix any issues found**

**Step 3: Final commit if needed**
