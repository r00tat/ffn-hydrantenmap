'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';

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

interface ParameterValue {
  name: string;
  unit: string;
  data: (number | null)[];
}

interface TawesFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
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

interface TawesMetadataResponse {
  stations: TawesStation[];
  parameters: unknown[];
}

interface WetterstationData {
  stationId: string;
  name: string;
  altitude: number;
  lat: number;
  lon: number;
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

// --- Constants ---

const METADATA_URL =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';
const DATA_URL =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min';
const PARAMETERS = 'TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW';
const POLL_INTERVAL = 600000; // 10 minutes

// Bounding box for Burgenland + nearby area
const LAT_MIN = 46.8;
const LAT_MAX = 48.2;
const LON_MIN = 15.8;
const LON_MAX = 17.2;

// 16-point compass directions (German)
const COMPASS_LABELS = [
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

// --- Icon helpers ---

function temperatureToColor(temp: number | null): string {
  if (temp === null) return '#888888';
  // HSL: 240 (blue) at <=0, 120 (green) at ~15, 0 (red) at >=35
  const clamped = Math.max(0, Math.min(35, temp));
  const hue = 240 - (clamped / 35) * 240;
  return `hsl(${Math.round(hue)}, 80%, 45%)`;
}

function createThermometerIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="28" height="28">
      <rect x="9" y="2" width="6" height="20" rx="3" fill="#fff" stroke="${color}" stroke-width="1.5"/>
      <circle cx="12" cy="27" r="5" fill="${color}" stroke="#fff" stroke-width="1"/>
      <rect x="10.5" y="10" width="3" height="14" rx="1.5" fill="${color}"/>
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

// --- Helpers ---

function degreesToCompass(degrees: number | null): string {
  if (degrees === null || isNaN(degrees)) return '-';
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_LABELS[index];
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getParamValue(
  params: Record<string, ParameterValue>,
  key: string
): number | null {
  const p = params[key];
  if (!p || !p.data || p.data.length === 0) return null;
  return p.data[0];
}

// --- Data hook ---

function useWetterstationData() {
  const [data, setData] = useState<WetterstationData[]>([]);
  const mountedRef = useRef(true);
  const stationsRef = useRef<TawesStation[] | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const fetchStations = async (): Promise<TawesStation[]> => {
      if (stationsRef.current) return stationsRef.current;

      const response = await fetch(METADATA_URL);
      if (!response.ok) {
        throw new Error(`Metadata fetch failed: ${response.status}`);
      }
      const metadata: TawesMetadataResponse = await response.json();

      const filtered = metadata.stations.filter(
        (s) =>
          s.is_active &&
          (s.state === 'Burgenland' ||
            (s.lat >= LAT_MIN &&
              s.lat <= LAT_MAX &&
              s.lon >= LON_MIN &&
              s.lon <= LON_MAX))
      );

      stationsRef.current = filtered;
      return filtered;
    };

    const refresh = async () => {
      try {
        const stations = await fetchStations();
        if (!mountedRef.current || stations.length === 0) return;

        const stationIds = stations.map((s) => s.id).join(',');
        const url = `${DATA_URL}?parameters=${PARAMETERS}&station_ids=${stationIds}&output_format=geojson`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Data fetch failed: ${response.status}`);
        }
        const geojson: TawesGeoJSON = await response.json();

        const stationMap = new Map<string, TawesStation>();
        for (const s of stations) {
          stationMap.set(s.id, s);
        }

        const timestamp =
          geojson.timestamps && geojson.timestamps.length > 0
            ? geojson.timestamps[geojson.timestamps.length - 1]
            : '';

        const result: WetterstationData[] = geojson.features
          .map((feature) => {
            const stationId = feature.properties.station;
            const station = stationMap.get(stationId);
            if (!station) return null;

            const params = feature.properties.parameters;
            return {
              stationId,
              name: station.name,
              altitude: station.altitude,
              lat: feature.geometry.coordinates[1],
              lon: feature.geometry.coordinates[0],
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
          })
          .filter(Boolean) as WetterstationData[];

        if (mountedRef.current) {
          setData(result);
        }
      } catch (err) {
        console.error('Failed to fetch Wetterstation data', err);
      }
    };

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return data;
}

// --- Component ---

export default function WetterstationLayer() {
  const stations = useWetterstationData();

  const markers = useMemo(
    () =>
      stations.map((s) => ({
        ...s,
        color: temperatureToColor(s.temperature),
      })),
    [stations]
  );

  return (
    <LayerGroup
      attribution='Wetterdaten: <a href="https://data.hub.geosphere.at" target="_blank" rel="noopener noreferrer">GeoSphere Austria</a>'
    >
      {markers.map((m) => (
        <Marker
          position={[m.lat, m.lon]}
          icon={getThermometerIcon(m.color)}
          key={m.stationId}
        >
          <Popup>
            <b>
              {m.name} ({m.altitude}&thinsp;m)
            </b>
            {m.temperature !== null && (
              <>
                <br />
                Temperatur: {m.temperature.toFixed(1)}&thinsp;&deg;C
              </>
            )}
            {m.windSpeed !== null && (
              <>
                <br />
                Wind: {m.windSpeed.toFixed(1)}&thinsp;m/s{' '}
                {degreesToCompass(m.windDirection)}
              </>
            )}
            {m.windGust !== null && (
              <>
                <br />
                Windspitze: {m.windGust.toFixed(1)}&thinsp;m/s
              </>
            )}
            {m.humidity !== null && (
              <>
                <br />
                Feuchte: {m.humidity.toFixed(0)}&thinsp;%
              </>
            )}
            {m.pressure !== null && (
              <>
                <br />
                Luftdruck: {m.pressure.toFixed(1)}&thinsp;hPa
              </>
            )}
            {m.precipitation !== null && m.precipitation > 0 && (
              <>
                <br />
                Niederschlag: {m.precipitation.toFixed(1)}&thinsp;mm
              </>
            )}
            {m.snowDepth !== null && m.snowDepth > 0 && (
              <>
                <br />
                Schneeh&ouml;he: {m.snowDepth.toFixed(0)}&thinsp;cm
              </>
            )}
            {m.sunshine !== null && m.sunshine > 0 && (
              <>
                <br />
                Sonnenschein: {Math.round(m.sunshine / 60)}&thinsp;min
              </>
            )}
            {m.solarRadiation !== null && m.solarRadiation > 0 && (
              <>
                <br />
                Globalstrahlung: {m.solarRadiation.toFixed(0)}&thinsp;W/m&sup2;
              </>
            )}
            {m.timestamp && (
              <>
                <br />
                Stand: {formatTimestamp(m.timestamp)}
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
