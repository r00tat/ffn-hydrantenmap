# Weather Station History Charts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/wetter/[stationId]` page with historical weather charts for individual TAWES stations, linked from the map marker popup.

**Architecture:** Client-side page using recharts for visualization. Fetches historical data from the GeoSphere Austria historical TAWES API (CORS enabled, no auth). Time range presets (12h/24h/48h/7d) control the query. Each weather parameter gets its own stacked chart. The 7d preset switches to hourly resolution endpoint.

**Tech Stack:** React, recharts, Next.js App Router, GeoSphere Austria TAWES Historical API, MUI

---

### Task 1: Install recharts

**Files:**
- Modify: `package.json`

**Step 1: Install recharts**

Run: `npm install recharts`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add recharts dependency for weather charts"
```

---

### Task 2: Create WetterstationHistory component

**Files:**
- Create: `src/components/Wetter/WetterstationHistory.tsx`

**Step 1: Create the component**

This is the main component. It takes a `stationId` prop, fetches metadata + historical data, and renders stacked charts.

```tsx
'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// --- Types ---

interface TawesStation {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  altitude: number;
  is_active: boolean;
}

interface HistoryDataPoint {
  timestamp: string;
  time: number; // ms for recharts
  TL: number | null;
  FF: number | null;
  FFX: number | null;
  DD: number | null;
  RF: number | null;
  P: number | null;
  RR: number | null;
  SCHNEE: number | null;
  SO: number | null; // already converted to minutes
  GLOW: number | null;
}

type TimeRange = '12h' | '24h' | '48h' | '7d';

// --- Constants ---

const TAWES_HISTORICAL =
  'https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min';
const KLIMA_HOURLY =
  'https://dataset.api.hub.geosphere.at/v1/station/historical/klima-v1-1h';
const TAWES_METADATA =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';
const PARAMETERS = 'TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW';

const RANGE_HOURS: Record<TimeRange, number> = {
  '12h': 12,
  '24h': 24,
  '48h': 48,
  '7d': 168,
};

// --- Data fetching ---

async function fetchStationInfo(
  stationId: string
): Promise<TawesStation | null> {
  const res = await fetch(TAWES_METADATA);
  if (!res.ok) return null;
  const data = await res.json();
  return (
    (data.stations as TawesStation[]).find((s) => s.id === stationId) || null
  );
}

async function fetchHistory(
  stationId: string,
  range: TimeRange
): Promise<HistoryDataPoint[]> {
  const now = new Date();
  const start = new Date(now.getTime() - RANGE_HOURS[range] * 3600000);

  const baseUrl = range === '7d' ? KLIMA_HOURLY : TAWES_HISTORICAL;
  const url = `${baseUrl}?parameters=${PARAMETERS}&station_ids=${stationId}&start=${start.toISOString()}&end=${now.toISOString()}&output_format=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
  const geojson = await res.json();

  const timestamps: string[] = geojson.timestamps || [];
  const feature = geojson.features?.[0];
  if (!feature) return [];

  const params = feature.properties.parameters as Record<
    string,
    { data: (number | null)[] }
  >;

  return timestamps.map((ts, i) => ({
    timestamp: ts,
    time: new Date(ts).getTime(),
    TL: params.TL?.data[i] ?? null,
    FF: params.FF?.data[i] ?? null,
    FFX: params.FFX?.data[i] ?? null,
    DD: params.DD?.data[i] ?? null,
    RF: params.RF?.data[i] ?? null,
    P: params.P?.data[i] ?? null,
    RR: params.RR?.data[i] ?? null,
    SCHNEE: params.SCHNEE?.data[i] ?? null,
    SO: params.SO?.data[i] != null ? Math.round(params.SO.data[i]! / 60) : null,
    GLOW: params.GLOW?.data[i] ?? null,
  }));
}

// --- Chart helpers ---

function formatXAxisTick(range: TimeRange) {
  return (ms: number) => {
    const d = new Date(ms);
    if (range === '7d') {
      return d.toLocaleString('de-AT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleString('de-AT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };
}

function tooltipTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function hasData(data: HistoryDataPoint[], key: keyof HistoryDataPoint): boolean {
  return data.some((d) => d[key] !== null);
}

// --- Chart config ---

interface ChartConfig {
  title: string;
  keys: { key: keyof HistoryDataPoint; label: string; color: string; dashed?: boolean }[];
  unit: string;
  type: 'line' | 'bar' | 'area';
}

const CHARTS: ChartConfig[] = [
  {
    title: 'Temperatur',
    keys: [{ key: 'TL', label: 'Temperatur', color: '#e53935' }],
    unit: '°C',
    type: 'line',
  },
  {
    title: 'Wind',
    keys: [
      { key: 'FF', label: 'Windgeschwindigkeit', color: '#1976d2' },
      { key: 'FFX', label: 'Windspitze', color: '#1976d2', dashed: true },
    ],
    unit: 'm/s',
    type: 'line',
  },
  {
    title: 'Niederschlag',
    keys: [{ key: 'RR', label: 'Niederschlag', color: '#1565c0' }],
    unit: 'mm',
    type: 'bar',
  },
  {
    title: 'Luftfeuchtigkeit',
    keys: [{ key: 'RF', label: 'Feuchte', color: '#43a047' }],
    unit: '%',
    type: 'line',
  },
  {
    title: 'Luftdruck',
    keys: [{ key: 'P', label: 'Luftdruck', color: '#6d4c41' }],
    unit: 'hPa',
    type: 'line',
  },
  {
    title: 'Schneehöhe',
    keys: [{ key: 'SCHNEE', label: 'Schneehöhe', color: '#90caf9' }],
    unit: 'cm',
    type: 'area',
  },
  {
    title: 'Sonnenschein',
    keys: [{ key: 'SO', label: 'Sonnenschein', color: '#fdd835' }],
    unit: 'min',
    type: 'bar',
  },
  {
    title: 'Globalstrahlung',
    keys: [{ key: 'GLOW', label: 'Strahlung', color: '#ff9800' }],
    unit: 'W/m²',
    type: 'area',
  },
];

// --- Single chart renderer ---

function WeatherChart({
  config,
  data,
  range,
}: {
  config: ChartConfig;
  data: HistoryDataPoint[];
  range: TimeRange;
}) {
  const tickFormatter = formatXAxisTick(range);

  const commonProps = {
    data,
    margin: { top: 5, right: 20, bottom: 5, left: 10 },
  };

  const xAxis = (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={['dataMin', 'dataMax']}
      tickFormatter={tickFormatter}
      tick={{ fontSize: 12 }}
    />
  );

  const yAxis = (
    <YAxis
      tick={{ fontSize: 12 }}
      width={50}
      label={{
        value: config.unit,
        angle: -90,
        position: 'insideLeft',
        style: { fontSize: 12 },
      }}
    />
  );

  const tooltip = (
    <Tooltip
      labelFormatter={(v) => tooltipTimestamp(v as number)}
      formatter={(value: number) => [
        `${value != null ? value.toFixed(1) : '–'} ${config.unit}`,
      ]}
    />
  );

  const grid = <CartesianGrid strokeDasharray="3 3" />;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        {config.title}
      </Typography>
      <ResponsiveContainer width="100%" height={200}>
        {config.type === 'line' ? (
          <LineChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {config.keys.length > 1 && <Legend />}
            {config.keys.map((k) => (
              <Line
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2}
                strokeDasharray={k.dashed ? '5 5' : undefined}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        ) : config.type === 'bar' ? (
          <BarChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {config.keys.map((k) => (
              <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color} />
            ))}
          </BarChart>
        ) : (
          <AreaChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {config.keys.map((k) => (
              <Area
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                fill={k.color}
                fillOpacity={0.3}
                stroke={k.color}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </Box>
  );
}

// --- Main component ---

export default function WetterstationHistory({
  stationId,
}: {
  stationId: string;
}) {
  const [station, setStation] = useState<TawesStation | null>(null);
  const [data, setData] = useState<HistoryDataPoint[]>([]);
  const [range, setRange] = useState<TimeRange>('24h');
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const loadData = useCallback(
    async (r: TimeRange) => {
      setLoading(true);
      try {
        const [info, history] = await Promise.all([
          station ? Promise.resolve(station) : fetchStationInfo(stationId),
          fetchHistory(stationId, r),
        ]);
        if (mountedRef.current) {
          if (info) setStation(info);
          setData(history);
        }
      } catch (err) {
        console.error('Failed to fetch weather history', err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [stationId, station]
  );

  useEffect(() => {
    mountedRef.current = true;
    loadData(range);
    return () => {
      mountedRef.current = false;
    };
  }, [range, loadData]);

  const handleRangeChange = (r: TimeRange) => {
    setRange(r);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 900, mx: 'auto' }}>
      <Link href="/map" style={{ textDecoration: 'none' }}>
        &larr; Zurück zur Karte
      </Link>

      <Typography variant="h5" sx={{ mt: 2, mb: 1 }}>
        {station ? (
          <>
            {station.name}{' '}
            <Typography component="span" variant="body1" color="text.secondary">
              ({station.altitude} m)
            </Typography>
          </>
        ) : (
          `Station ${stationId}`
        )}
      </Typography>

      <ButtonGroup sx={{ mb: 3 }}>
        {(['12h', '24h', '48h', '7d'] as TimeRange[]).map((r) => (
          <Button
            key={r}
            variant={range === r ? 'contained' : 'outlined'}
            onClick={() => handleRangeChange(r)}
          >
            {r}
          </Button>
        ))}
      </ButtonGroup>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : data.length === 0 ? (
        <Typography color="text.secondary">
          Keine Daten für den gewählten Zeitraum verfügbar.
        </Typography>
      ) : (
        CHARTS.filter((chart) =>
          chart.keys.some((k) => hasData(data, k.key))
        ).map((chart) => (
          <WeatherChart
            key={chart.title}
            config={chart}
            data={data}
            range={range}
          />
        ))
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Datenquelle:{' '}
        <a
          href="https://data.hub.geosphere.at"
          target="_blank"
          rel="noopener noreferrer"
        >
          GeoSphere Austria
        </a>{' '}
        (CC BY)
      </Typography>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/Wetter/WetterstationHistory.tsx
git commit -m "feat: add WetterstationHistory component with recharts"
```

---

### Task 3: Create the page route

**Files:**
- Create: `src/app/wetter/[stationId]/page.tsx`

**Step 1: Create the page**

```tsx
import type { NextPage } from 'next';
import WetterstationHistory from '../../../components/Wetter/WetterstationHistory';

interface Props {
  params: Promise<{ stationId: string }>;
}

const WetterStationPage: NextPage<Props> = async ({ params }) => {
  const { stationId } = await params;
  return <WetterstationHistory stationId={stationId} />;
};

export default WetterStationPage;
```

Note: In Next.js 16, `params` is a Promise that must be awaited.

**Step 2: Commit**

```bash
git add src/app/wetter/[stationId]/page.tsx
git commit -m "feat: add /wetter/[stationId] page route"
```

---

### Task 4: Add "Verlauf" link to WetterstationLayer popup

**Files:**
- Modify: `src/components/Map/layers/WetterstationLayer.tsx`

**Step 1: Add the link**

At the top of the file, add the Next.js Link import:

```typescript
import Link from 'next/link';
```

In the `WetterstationLayer` component, inside the `<Popup>` for each marker, add a "Verlauf" link after the timestamp line (after the `Stand: ...` block, before `</Popup>`):

```tsx
              <br />
              <Link
                href={`/wetter/${m.stationId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Verlauf &rarr;
              </Link>
```

**Step 2: Commit**

```bash
git add src/components/Map/layers/WetterstationLayer.tsx
git commit -m "feat: add Verlauf link to weather station popup"
```

---

### Task 5: Build verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: No new errors

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds, `/wetter/[stationId]` appears in route list

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint/build issues in weather history"
```

(Skip if no fixes needed.)
