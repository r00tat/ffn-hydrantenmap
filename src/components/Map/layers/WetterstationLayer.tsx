'use client';

import L from 'leaflet';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import { WetterstationRecord } from '../../../common/gis-objects';
import {
  fetchWetterstationLiveData,
  WetterstationLiveData,
} from './WetterstationAction';

// --- Constants ---

const LAYER_NAME = 'Wetterstationen';
const POLL_INTERVAL = 600000; // 10 minutes
const CACHE_TTL_MS = POLL_INTERVAL;

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

// --- Data hook ---

function useWetterstationLiveData(wetterstationen: WetterstationRecord[]) {
  const [liveData, setLiveData] = useState<Map<string, WetterstationLiveData>>(
    new Map()
  );
  const [visible, setVisible] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const map = useMap();

  // Track layer visibility
  useEffect(() => {
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.name === LAYER_NAME) setVisible(true);
    };
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.name === LAYER_NAME) setVisible(false);
    };
    map.on('overlayadd', onAdd as L.LeafletEventHandlerFn);
    map.on('overlayremove', onRemove as L.LeafletEventHandlerFn);
    return () => {
      map.off('overlayadd', onAdd as L.LeafletEventHandlerFn);
      map.off('overlayremove', onRemove as L.LeafletEventHandlerFn);
    };
  }, [map]);

  // Fetch live data when visible
  useEffect(() => {
    mountedRef.current = true;
    if (!visible || wetterstationen.length === 0) return;

    const stationIds = wetterstationen.map((s) => s.id!).filter(Boolean);

    const refresh = async () => {
      try {
        const data = await fetchWetterstationLiveData(stationIds);
        if (mountedRef.current) {
          const map = new Map<string, WetterstationLiveData>();
          for (const d of data) {
            map.set(d.stationId, d);
          }
          setLiveData(map);
          lastFetchRef.current = Date.now();
        }
      } catch (err) {
        console.error('Failed to fetch Wetterstation live data', err);
      }
    };

    const age = Date.now() - lastFetchRef.current;
    if (age >= CACHE_TTL_MS) {
      refresh();
    }

    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [visible, wetterstationen]);

  return liveData;
}

// --- Component ---

interface WetterstationLayerProps {
  wetterstationen: WetterstationRecord[];
}

export default function WetterstationLayer({
  wetterstationen,
}: WetterstationLayerProps) {
  const liveDataMap = useWetterstationLiveData(wetterstationen);

  const markers = useMemo(
    () =>
      wetterstationen.map((station) => {
        const live = liveDataMap.get(station.id!);
        const temperature = live?.temperature ?? null;
        return {
          ...station,
          stationId: station.id!,
          live,
          color: temperatureToColor(temperature),
        };
      }),
    [wetterstationen, liveDataMap]
  );

  return (
    <LayerGroup
      attribution='Wetterdaten: <a href="https://data.hub.geosphere.at" target="_blank" rel="noopener noreferrer">GeoSphere Austria</a>'
    >
      {markers.map((m) => (
        <Marker
          position={[m.lat, m.lng]}
          icon={getThermometerIcon(m.color)}
          key={m.stationId}
        >
          <Popup>
            <b>
              {m.name} ({m.altitude}&thinsp;m)
            </b>
            {m.live ? (
              <>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    margin: '4px 0',
                    width: '100%',
                  }}
                >
                  <tbody>
                    {m.live.temperature !== null && (
                      <tr>
                        <td>Temperatur</td>
                        <td style={{ textAlign: 'right' }}>
                          {m.live.temperature.toFixed(1)}&thinsp;&deg;C
                        </td>
                      </tr>
                    )}
                    {m.live.windSpeed !== null && (
                      <tr>
                        <td>Wind</td>
                        <td style={{ textAlign: 'right' }}>
                          {m.live.windSpeed.toFixed(1)}&thinsp;m/s{' '}
                          {degreesToCompass(m.live.windDirection)}
                        </td>
                      </tr>
                    )}
                    {m.live.windGust !== null && (
                      <tr>
                        <td>Windspitze</td>
                        <td style={{ textAlign: 'right' }}>
                          {m.live.windGust.toFixed(1)}&thinsp;m/s
                        </td>
                      </tr>
                    )}
                    {m.live.humidity !== null && (
                      <tr>
                        <td>Feuchte</td>
                        <td style={{ textAlign: 'right' }}>
                          {m.live.humidity.toFixed(0)}&thinsp;%
                        </td>
                      </tr>
                    )}
                    {m.live.pressure !== null && (
                      <tr>
                        <td>Luftdruck</td>
                        <td style={{ textAlign: 'right' }}>
                          {m.live.pressure.toFixed(1)}&thinsp;hPa
                        </td>
                      </tr>
                    )}
                    {m.live.precipitation !== null &&
                      m.live.precipitation > 0 && (
                        <tr>
                          <td>Niederschlag</td>
                          <td style={{ textAlign: 'right' }}>
                            {m.live.precipitation.toFixed(1)}&thinsp;mm
                          </td>
                        </tr>
                      )}
                    {m.live.snowDepth !== null && m.live.snowDepth > 0 && (
                      <tr>
                        <td>Schneehöhe</td>
                        <td style={{ textAlign: 'right' }}>
                          {m.live.snowDepth.toFixed(0)}&thinsp;cm
                        </td>
                      </tr>
                    )}
                    {m.live.sunshine !== null && m.live.sunshine > 0 && (
                      <tr>
                        <td>Sonnenschein</td>
                        <td style={{ textAlign: 'right' }}>
                          {Math.round(m.live.sunshine / 60)}&thinsp;min
                        </td>
                      </tr>
                    )}
                    {m.live.solarRadiation !== null &&
                      m.live.solarRadiation > 0 && (
                        <tr>
                          <td>Globalstrahlung</td>
                          <td style={{ textAlign: 'right' }}>
                            {m.live.solarRadiation.toFixed(0)}&thinsp;W/m&sup2;
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
                {m.live.timestamp && (
                  <span style={{ fontSize: '0.85em', color: '#666' }}>
                    Stand: {formatTimestamp(m.live.timestamp)}
                  </span>
                )}
              </>
            ) : (
              <p style={{ fontSize: '0.85em', color: '#666' }}>
                Lade Wetterdaten...
              </p>
            )}
            <br />
            <Link href={`/wetter/${m.stationId}`}>Verlauf &rarr;</Link>
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
