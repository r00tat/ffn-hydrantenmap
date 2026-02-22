# Weather Station Layer (Wetterstationen) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a map layer showing live weather data from GeoSphere Austria TAWES stations in the Burgenland region.

**Architecture:** Purely client-side layer component fetching from the public GeoSphere API (CORS enabled, no auth). Station metadata is fetched once, filtered by region, then current data is polled every 10 minutes via GeoJSON endpoint. Follows the same layer pattern as PegelstandLayer.

**Tech Stack:** React, Leaflet/React Leaflet, GeoSphere Austria TAWES REST API

---

### Task 1: Create WetterstationLayer component with data hook

**Files:**
- Create: `src/components/Map/layers/WetterstationLayer.tsx`

**Step 1: Create the component file with types, data hook, and marker rendering**

```tsx
'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';

const TAWES_BASE =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min';

const PARAMETERS = [
  'TL',
  'FF',
  'FFX',
  'DD',
  'RF',
  'P',
  'RR',
  'SCHNEE',
  'SO',
  'GLOW',
];

// Burgenland + nearby region bounding box
const BBOX = { latMin: 46.8, latMax: 48.2, lonMin: 15.8, lonMax: 17.2 };

const REFRESH_INTERVAL = 600000; // 10 minutes

interface TawesStation {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  altitude: number;
}

interface WetterstationData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  altitude: number;
  timestamp: string;
  temperature?: number;
  windSpeed?: number;
  windGust?: number;
  windDirection?: number;
  humidity?: number;
  pressure?: number;
  precipitation?: number;
  snowDepth?: number;
  sunshine?: number;
  solarRadiation?: number;
}

function temperatureToColor(temp: number | undefined): string {
  if (temp === undefined || temp === null) return '#9E9E9E';
  // blue (<=0) -> cyan (5) -> green (15) -> orange (25) -> red (>=35)
  const clamped = Math.max(-10, Math.min(40, temp));
  const ratio = (clamped + 10) / 50; // 0..1
  const hue = (1 - ratio) * 240; // 240 (blue) -> 0 (red)
  return `hsl(${hue}, 80%, 45%)`;
}

function createThermometerIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
      <rect x="9" y="2" width="6" height="14" rx="3" fill="${color}" stroke="#fff" stroke-width="0.8"/>
      <circle cx="12" cy="18" r="4" fill="${color}" stroke="#fff" stroke-width="0.8"/>
      <rect x="10.5" y="6" width="3" height="10" rx="1.5" fill="#fff" opacity="0.4"/>
    </svg>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

const iconCache = new Map<string, L.DivIcon>();

function getThermometerIcon(color: string): L.DivIcon {
  let icon = iconCache.get(color);
  if (!icon) {
    icon = createThermometerIcon(color);
    iconCache.set(color, icon);
  }
  return icon;
}

function windDirectionLabel(degrees: number): string {
  const dirs = [
    'N',
    'NNO',
    'NO',
    'ONO',
    'O',
    'OSO',
    'SO',
    'SSO',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return dirs[index];
}

async function fetchStationMetadata(): Promise<TawesStation[]> {
  const res = await fetch(`${TAWES_BASE}/metadata`);
  if (!res.ok) throw new Error(`Metadata fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.stations as TawesStation[]).filter(
    (s) =>
      s.is_active &&
      (s.state === 'Burgenland' ||
        (s.lat >= BBOX.latMin &&
          s.lat <= BBOX.latMax &&
          s.lon >= BBOX.lonMin &&
          s.lon <= BBOX.lonMax))
  );
}

async function fetchStationData(
  stationIds: string[],
  stations: TawesStation[]
): Promise<WetterstationData[]> {
  const ids = stationIds.join(',');
  const params = PARAMETERS.join(',');
  const res = await fetch(
    `${TAWES_BASE}?parameters=${params}&station_ids=${ids}&output_format=geojson`
  );
  if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
  const geojson = await res.json();

  const timestamp = geojson.timestamps?.[0] || '';
  const stationMap = new Map(stations.map((s) => [s.id, s]));

  return geojson.features.map(
    (feature: {
      geometry: { coordinates: [number, number] };
      properties: {
        station: string;
        parameters: Record<
          string,
          { data: (number | null)[] }
        >;
      };
    }) => {
      const p = feature.properties.parameters;
      const val = (key: string) => p[key]?.data?.[0] ?? undefined;
      const station = stationMap.get(feature.properties.station);

      return {
        id: feature.properties.station,
        name: station?.name || feature.properties.station,
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        altitude: station?.altitude || 0,
        timestamp,
        temperature: val('TL'),
        windSpeed: val('FF'),
        windGust: val('FFX'),
        windDirection: val('DD'),
        humidity: val('RF'),
        pressure: val('P'),
        precipitation: val('RR'),
        snowDepth: val('SCHNEE'),
        sunshine: val('SO'),
        solarRadiation: val('GLOW'),
      } as WetterstationData;
    }
  );
}

function useWetterstationData() {
  const [data, setData] = useState<WetterstationData[]>([]);
  const mountedRef = useRef(true);
  const stationsRef = useRef<TawesStation[]>([]);

  useEffect(() => {
    mountedRef.current = true;

    const refresh = async () => {
      try {
        if (stationsRef.current.length === 0) {
          stationsRef.current = await fetchStationMetadata();
        }
        const ids = stationsRef.current.map((s) => s.id);
        if (ids.length === 0) return;
        const result = await fetchStationData(ids, stationsRef.current);
        if (mountedRef.current) {
          setData(result);
        }
      } catch (err) {
        console.error('Failed to fetch weather station data', err);
      }
    };

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return data;
}

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export default function WetterstationLayer() {
  const data = useWetterstationData();

  const markers = useMemo(() => data.filter((d) => d.lat && d.lon), [data]);

  return (
    <LayerGroup
      attribution='Wetterdaten: <a href="https://data.hub.geosphere.at" target="_blank" rel="noopener noreferrer">GeoSphere Austria</a> (CC BY)'
    >
      {markers.map((station) => {
        const color = temperatureToColor(station.temperature);
        return (
          <Marker
            position={[station.lat, station.lon]}
            icon={getThermometerIcon(color)}
            key={station.id}
          >
            <Popup>
              <b>{station.name}</b>
              {station.altitude > 0 && (
                <span style={{ fontWeight: 'normal' }}>
                  {' '}
                  ({station.altitude} m)
                </span>
              )}
              {station.temperature != null && (
                <>
                  <br />
                  Temperatur: {station.temperature} &deg;C
                </>
              )}
              {station.windSpeed != null && (
                <>
                  <br />
                  Wind: {station.windSpeed} m/s
                  {station.windDirection != null && (
                    <> ({windDirectionLabel(station.windDirection)})</>
                  )}
                </>
              )}
              {station.windGust != null && (
                <>
                  <br />
                  B&ouml;en: {station.windGust} m/s
                </>
              )}
              {station.humidity != null && (
                <>
                  <br />
                  Feuchte: {station.humidity} %
                </>
              )}
              {station.pressure != null && (
                <>
                  <br />
                  Luftdruck: {station.pressure} hPa
                </>
              )}
              {station.precipitation != null && station.precipitation > 0 && (
                <>
                  <br />
                  Niederschlag: {station.precipitation} mm
                </>
              )}
              {station.snowDepth != null && station.snowDepth > 0 && (
                <>
                  <br />
                  Schneeh&ouml;he: {station.snowDepth} cm
                </>
              )}
              {station.sunshine != null && station.sunshine > 0 && (
                <>
                  <br />
                  Sonnenschein: {Math.round(station.sunshine / 60)} min
                </>
              )}
              {station.solarRadiation != null &&
                station.solarRadiation > 0 && (
                  <>
                    <br />
                    Strahlung: {station.solarRadiation} W/m&sup2;
                  </>
                )}
              {station.timestamp && (
                <>
                  <br />
                  <small>Stand: {formatTimestamp(station.timestamp)}</small>
                </>
              )}
            </Popup>
          </Marker>
        );
      })}
    </LayerGroup>
  );
}
```

**Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/components/Map/layers/WetterstationLayer.tsx 2>&1 || true`

Check for type errors and fix if needed.

**Step 3: Commit**

```bash
git add src/components/Map/layers/WetterstationLayer.tsx
git commit -m "feat: add WetterstationLayer with GeoSphere TAWES integration"
```

---

### Task 2: Register layer in Map.tsx

**Files:**
- Modify: `src/components/Map/Map.tsx:28-29` (add import)
- Modify: `src/components/Map/Map.tsx:114-116` (add overlay after Pegelstand)

**Step 1: Add import**

After line 28 (`import PegelstandLayer from './layers/PegelstandLayer';`), add:

```typescript
import WetterstationLayer from './layers/WetterstationLayer';
```

**Step 2: Add LayersControl.Overlay**

After the Pegelstand overlay block (lines 114-116), add:

```tsx
          <LayersControl.Overlay name="Wetterstationen">
            <WetterstationLayer />
          </LayersControl.Overlay>
```

**Step 3: Commit**

```bash
git add src/components/Map/Map.tsx
git commit -m "feat: register WetterstationLayer in Map"
```

---

### Task 3: Register layer in LocationMapPicker.tsx

**Files:**
- Modify: `src/components/Einsatzorte/LocationMapPicker.tsx:32` (add import)
- Modify: `src/components/Einsatzorte/LocationMapPicker.tsx:279-281` (add overlay after Pegelstand)

**Step 1: Add import**

After line 32 (`import PegelstandLayer from '../Map/layers/PegelstandLayer';`), add:

```typescript
import WetterstationLayer from '../Map/layers/WetterstationLayer';
```

**Step 2: Add LayersControl.Overlay**

After the Pegelstand overlay block (lines 279-281), add:

```tsx
            <LayersControl.Overlay name="Wetterstationen">
              <WetterstationLayer />
            </LayersControl.Overlay>
```

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/LocationMapPicker.tsx
git commit -m "feat: register WetterstationLayer in LocationMapPicker"
```

---

### Task 4: Build verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: No new errors

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Fix any issues if needed**

If lint or build fails, fix the issues and amend the previous commit.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint/build issues in WetterstationLayer"
```

(Skip if no fixes needed.)
