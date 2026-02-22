# NÖ Pegelstände Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Pegelstände map layer with water level and measurement data from Niederösterreich, filtered to stations within ~50km of the Burgenland border.

**Architecture:** Add a new server-side fetch function for NÖ's MapList.json API, filter by bounding box, group entries by station, and merge with existing Burgenland data. The layer component handles NÖ entries (which include coordinates) without Firestore lookup.

**Tech Stack:** Next.js server actions, React Leaflet, existing PegelstandData types

---

### Task 1: Extend PegelstandData Interface

**Files:**
- Modify: `src/components/Map/layers/PegelstandAction.ts:5-18`

**Step 1: Add new fields to the PegelstandData interface**

Add `source`, coordinate fields, and NÖ-specific measurement fields. Existing Burgenland code continues to work unchanged — all new fields are optional.

```typescript
export interface PegelstandData {
  slug: string;
  name: string;
  type: 'river' | 'lake';
  timestamp: string;
  waterLevel?: string;
  waterLevelUnit: string;
  discharge?: string;
  temperature?: string;
  color: string;
  /** Human-readable drain level label, e.g. "MQ-HQ1" (rivers only) */
  drainLevel?: string;
  detailUrl: string;
  /** Data source: 'bgld' for Burgenland, 'noe' for Niederösterreich */
  source?: 'bgld' | 'noe';
  /** Coordinates (NÖ entries carry these directly; Bgld uses Firestore lookup) */
  lat?: number;
  lng?: number;
  /** River name from NÖ API */
  rivername?: string;
  /** NÖ-specific measurement fields (all parameter types) */
  waterLevelForecast?: string;
  dischargeForecast?: string;
  groundwaterLevel?: string;
  precipitation3h?: string;
  precipitation12h?: string;
  precipitation24h?: string;
  airTemperature?: string;
  humidity?: string;
}
```

**Step 2: Add `source: 'bgld'` to existing Burgenland results**

In `parseRiverPage` (line 115) and `parseLakePage` (line 166), add `source: 'bgld'` to the pushed objects.

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds (new optional fields don't break anything)

**Step 4: Commit**

```bash
git add src/components/Map/layers/PegelstandAction.ts
git commit -m "feat: extend PegelstandData interface for NÖ data source"
```

---

### Task 2: Add NÖ Data Fetching and Parsing

**Files:**
- Modify: `src/components/Map/layers/PegelstandAction.ts`

**Step 1: Add NÖ constants and bounding box**

After the existing `LAKE_URL` constant (line 47), add:

```typescript
const NOE_MAPLIST_URL = 'https://www.noel.gv.at/wasserstand/kidata/maplist/MapList.json';

/** Bounding box: ~50km buffer around Burgenland (46.85-48.1°N, 16.1-17.1°E) */
const NOE_BBOX = {
  minLat: 46.4,
  maxLat: 48.55,
  minLng: 15.45,
  maxLng: 17.75,
};
```

**Step 2: Define NÖ API response type**

```typescript
interface NoeMapListEntry {
  Parameter: string;
  Stationnumber: string;
  Stationname: string;
  Timestamp: string;
  Value: string;
  Unit: string;
  ClassID: string;
  Class: string;
  TextColor: string;
  Lat: string;
  Long: string;
  Linkparameter: string;
  Grafik: string;
  Rivername: string;
  HydroUnit: string;
  Catchment: string;
}
```

**Step 3: Implement NÖ fetch, filter, and group function**

```typescript
/** NÖ alert level ClassID → human-readable label */
const NOE_DRAIN_LABELS: Record<string, string> = {
  '1': '< MW',
  '2': '> MW',
  '3': '> HW1',
  '4': '> HW5',
  '5': '> HW30',
};

async function fetchNoeData(): Promise<PegelstandData[]> {
  const response = await fetch(NOE_MAPLIST_URL, { next: { revalidate: 300 } });
  if (!response.ok) {
    console.error(`Failed to fetch NÖ data: ${response.status} ${response.statusText}`);
    return [];
  }

  const entries: NoeMapListEntry[] = await response.json();

  // Filter by bounding box
  const filtered = entries.filter((e) => {
    const lat = parseFloat(e.Lat);
    const lng = parseFloat(e.Long);
    return (
      !isNaN(lat) && !isNaN(lng) &&
      lat >= NOE_BBOX.minLat && lat <= NOE_BBOX.maxLat &&
      lng >= NOE_BBOX.minLng && lng <= NOE_BBOX.maxLng
    );
  });

  // Group by station number
  const stationGroups = new Map<string, NoeMapListEntry[]>();
  for (const entry of filtered) {
    const group = stationGroups.get(entry.Stationnumber) || [];
    group.push(entry);
    stationGroups.set(entry.Stationnumber, group);
  }

  // Convert each station group to a PegelstandData entry
  const results: PegelstandData[] = [];
  for (const [stationNumber, group] of stationGroups) {
    const byParam = new Map<string, NoeMapListEntry>();
    for (const e of group) {
      byParam.set(e.Parameter, e);
    }

    // Use first entry for common fields
    const first = group[0];
    const lat = parseFloat(first.Lat);
    const lng = parseFloat(first.Long);

    // Determine color from Wasserstand > Durchfluss > default
    const wsEntry = byParam.get('Wasserstand') || byParam.get('WasserstandPrognose');
    const dfEntry = byParam.get('Durchfluss') || byParam.get('DurchflussPrognose');
    const colorSource = wsEntry || dfEntry || first;
    const color = colorSource.Class || DEFAULT_COLOR;
    const classId = colorSource.ClassID;
    const drainLevel = classId && classId !== '0' ? NOE_DRAIN_LABELS[classId] : undefined;

    // Pick the most recent timestamp from all parameters
    const timestamps = group
      .map((e) => e.Timestamp)
      .filter(Boolean)
      .sort()
      .reverse();
    const timestamp = timestamps[0]
      ? new Date(timestamps[0]).toLocaleString('de-AT', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '';

    results.push({
      slug: `noe-${stationNumber}`,
      name: first.Stationname,
      type: 'river', // NÖ doesn't distinguish river/lake in this API
      timestamp,
      waterLevel: byParam.get('Wasserstand')?.Value,
      waterLevelUnit: byParam.get('Wasserstand')?.Unit || 'cm',
      waterLevelForecast: byParam.get('WasserstandPrognose')?.Value,
      discharge: byParam.get('Durchfluss')?.Value,
      dischargeForecast: byParam.get('DurchflussPrognose')?.Value,
      temperature: byParam.get('Wassertemperatur')?.Value,
      groundwaterLevel: byParam.get('Grundwasserspiegel')?.Value,
      precipitation3h: byParam.get('Niederschlag03h')?.Value,
      precipitation12h: byParam.get('Niederschlag12h')?.Value,
      precipitation24h: byParam.get('Niederschlag24h')?.Value,
      airTemperature: byParam.get('Lufttemperatur')?.Value,
      humidity: byParam.get('Luftfeuchtigkeit')?.Value,
      color,
      drainLevel,
      detailUrl: `https://www.noel.gv.at/wasserstand/#/de/Messstellen/Details/${stationNumber}/${first.Linkparameter || 'Wasserstand'}/${first.Grafik || '3Tage'}`,
      source: 'noe',
      lat,
      lng,
      rivername: first.Rivername,
    });
  }

  return results;
}
```

**Step 4: Update `fetchPegelstandData` to include NÖ data**

Modify `fetchPegelstandData` (line 184-218) to fetch NÖ in parallel with Burgenland:

```typescript
export async function fetchPegelstandData(): Promise<PegelstandData[]> {
  await actionUserRequired();

  try {
    const [riverResponse, lakeResponse, noeData] = await Promise.all([
      fetch(RIVER_URL, { next: { revalidate: 300 } }),
      fetch(LAKE_URL, { next: { revalidate: 300 } }),
      fetchNoeData(),
    ]);

    const results: PegelstandData[] = [];

    if (riverResponse.ok) {
      const riverHtml = await riverResponse.text();
      results.push(...parseRiverPage(riverHtml));
    } else {
      console.error(
        `Failed to fetch river data: ${riverResponse.status} ${riverResponse.statusText}`
      );
    }

    if (lakeResponse.ok) {
      const lakeHtml = await lakeResponse.text();
      results.push(...parseLakePage(lakeHtml));
    } else {
      console.error(
        `Failed to fetch lake data: ${lakeResponse.status} ${lakeResponse.statusText}`
      );
    }

    results.push(...noeData);

    return results;
  } catch (error) {
    console.error('Failed to fetch Pegelstand data:', error);
    return [];
  }
}
```

**Step 5: Verify build passes**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/components/Map/layers/PegelstandAction.ts
git commit -m "feat: fetch and parse NÖ water level data with bounding box filter"
```

---

### Task 3: Update PegelstandLayer to Handle NÖ Entries

**Files:**
- Modify: `src/components/Map/layers/PegelstandLayer.tsx`

**Step 1: Update marker merge logic**

Modify the `markers` useMemo (line 80-97) to handle NÖ entries (which carry lat/lng directly) alongside Burgenland entries (which need Firestore lookup):

```typescript
const markers = useMemo<PegelstandMarkerData[]>(() => {
  const stationMap = new Map<string, PegelstandStation>();
  for (const station of stations) {
    stationMap.set(station.id, station);
  }

  return liveData
    .map((entry) => {
      // NÖ entries carry coordinates directly
      if (entry.source === 'noe' && entry.lat && entry.lng) {
        return {
          ...entry,
          lat: entry.lat,
          lng: entry.lng,
        };
      }
      // Burgenland entries need Firestore station lookup
      const station = stationMap.get(entry.slug);
      if (!station || (!station.lat && !station.lng)) return null;
      return {
        ...entry,
        lat: station.lat,
        lng: station.lng,
      };
    })
    .filter(Boolean) as PegelstandMarkerData[];
}, [liveData, stations]);
```

**Step 2: Update popup to show all NÖ parameter fields**

Replace the Popup content (lines 109-160) with an extended version that shows NÖ-specific fields when available:

```tsx
<Popup>
  <b>{marker.name}</b>
  {marker.rivername && (
    <>
      <br />
      <small>{marker.rivername}</small>
    </>
  )}
  {marker.drainLevel && (
    <>
      <br />
      <span
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: marker.color,
          marginRight: 4,
          verticalAlign: 'middle',
        }}
      />
      {marker.drainLevel}
    </>
  )}
  {marker.waterLevel && (
    <>
      <br />
      Wasserstand: {marker.waterLevel} {marker.waterLevelUnit}
    </>
  )}
  {marker.waterLevelForecast && (
    <>
      <br />
      Prognose: {marker.waterLevelForecast} {marker.waterLevelUnit}
    </>
  )}
  {marker.discharge && (
    <>
      <br />
      Abfluss: {marker.discharge} m&sup3;/s
    </>
  )}
  {marker.dischargeForecast && (
    <>
      <br />
      Abfluss-Prognose: {marker.dischargeForecast} m&sup3;/s
    </>
  )}
  {marker.temperature && (
    <>
      <br />
      Wassertemperatur: {marker.temperature} &deg;C
    </>
  )}
  {marker.groundwaterLevel && (
    <>
      <br />
      Grundwasser: {marker.groundwaterLevel} m &uuml;.A.
    </>
  )}
  {(marker.precipitation3h || marker.precipitation12h || marker.precipitation24h) && (
    <>
      <br />
      Niederschlag:
      {marker.precipitation3h && ` ${marker.precipitation3h}mm/3h`}
      {marker.precipitation12h && ` ${marker.precipitation12h}mm/12h`}
      {marker.precipitation24h && ` ${marker.precipitation24h}mm/24h`}
    </>
  )}
  {marker.airTemperature && (
    <>
      <br />
      Lufttemperatur: {marker.airTemperature} &deg;C
    </>
  )}
  {marker.humidity && (
    <>
      <br />
      Luftfeuchtigkeit: {marker.humidity}%
    </>
  )}
  {marker.timestamp && (
    <>
      <br />
      Stand: {marker.timestamp}
    </>
  )}
  <br />
  {marker.source === 'noe' ? (
    <a
      href={marker.detailUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      Details &rarr;
    </a>
  ) : (
    <a
      href={`https://wasser.bgld.gv.at${marker.detailUrl}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Details &rarr;
    </a>
  )}
</Popup>
```

**Step 3: Update attribution**

Update the LayerGroup attribution (line 101) to include both sources:

```tsx
<LayerGroup
  attribution='Pegelst&auml;nde: <a href="https://wasser.bgld.gv.at" target="_blank" rel="noopener noreferrer">Wasserportal Burgenland</a> | <a href="https://www.noel.gv.at/wasserstand/" target="_blank" rel="noopener noreferrer">Land Nieder&ouml;sterreich</a>'
>
```

**Step 4: Verify build passes**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/components/Map/layers/PegelstandLayer.tsx
git commit -m "feat: display NÖ Pegelstände with all parameter types in unified layer"
```

---

### Task 4: Manual Verification

**Step 1: Start dev server and verify**

Run: `npm run dev`

Check:
1. Open the map, enable the Pegelstände layer
2. Verify Burgenland stations still display correctly
3. Verify NÖ stations appear near the Burgenland border (Leitha, Piesting, Schwechat, etc.)
4. Click an NÖ marker — popup should show available parameters
5. Click "Details →" on an NÖ marker — should open noel.gv.at detail page
6. Verify no NÖ stations appear far from Burgenland (e.g., no stations near Linz or Krems)
7. Check attribution bar shows both sources

**Step 2: Final commit if any adjustments needed**
