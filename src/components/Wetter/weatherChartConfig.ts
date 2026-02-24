// Shared types and configuration for weather chart implementations

// --- Types ---

export interface TawesStation {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  altitude: number;
  is_active: boolean;
}

export interface HistoryDataPoint {
  timestamp: string;
  time: number; // ms
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

export type TimeRange = '12h' | '24h' | '48h' | '7d';

// --- Constants ---

export const TAWES_HISTORICAL =
  'https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min';
export const KLIMA_HOURLY =
  'https://dataset.api.hub.geosphere.at/v1/station/historical/klima-v1-1h';
export const TAWES_METADATA =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';
export const PARAMETERS = 'TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW';

export const RANGE_HOURS: Record<TimeRange, number> = {
  '12h': 12,
  '24h': 24,
  '48h': 48,
  '7d': 168,
};

// --- Data fetching ---

export async function fetchStationInfo(
  stationId: string
): Promise<TawesStation | null> {
  const res = await fetch(TAWES_METADATA);
  if (!res.ok) return null;
  const data = await res.json();
  return (
    (data.stations as TawesStation[]).find((s) => s.id === stationId) || null
  );
}

export async function fetchHistory(
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

export function formatXAxisTick(range: TimeRange) {
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

export function tooltipTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function hasData(
  data: HistoryDataPoint[],
  key: keyof HistoryDataPoint
): boolean {
  return data.some((d) => d[key] !== null);
}

// --- Chart config ---

export interface ChartConfig {
  title: string;
  keys: {
    key: keyof HistoryDataPoint;
    label: string;
    color: string;
    dashed?: boolean;
  }[];
  unit: string;
  type: 'line' | 'bar' | 'area';
}

export const CHARTS: ChartConfig[] = [
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
