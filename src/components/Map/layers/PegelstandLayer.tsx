'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import { PegelstandRecord } from '../../../common/gis-objects';
import {
  fetchPegelstandLiveData,
  PegelstandData,
} from './PegelstandAction';

// --- Constants ---

const LAYER_NAME = 'Pegelstände';
const POLL_INTERVAL = 300000; // 5 minutes
const CACHE_TTL_MS = POLL_INTERVAL;

// --- Icon helpers ---

function createWaterDropIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><path d="M12 2c0 0-8 9.5-8 14a8 8 0 0 0 16 0c0-4.5-8-14-8-14z" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

const iconCache = new Map<string, L.DivIcon>();

function getWaterDropIcon(color: string): L.DivIcon {
  let icon = iconCache.get(color);
  if (!icon) {
    icon = createWaterDropIcon(color);
    iconCache.set(color, icon);
  }
  return icon;
}

// --- Data hook ---

function usePegelstandLiveData(pegelstaende: PegelstandRecord[]) {
  const [liveData, setLiveData] = useState<Map<string, PegelstandData>>(
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
    if (!visible || pegelstaende.length === 0) return;

    const stationIds = pegelstaende.map((s) => s.id!).filter(Boolean);

    const refresh = async () => {
      try {
        const data = await fetchPegelstandLiveData(stationIds);
        if (mountedRef.current) {
          const dataMap = new Map<string, PegelstandData>();
          for (const d of data) {
            dataMap.set(d.slug, d);
          }
          setLiveData(dataMap);
          lastFetchRef.current = Date.now();
        }
      } catch (err) {
        console.error('Failed to fetch Pegelstand live data', err);
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
  }, [visible, pegelstaende]);

  return liveData;
}

// --- Component ---

interface PegelstandLayerProps {
  pegelstaende: PegelstandRecord[];
}

export default function PegelstandLayer({
  pegelstaende,
}: PegelstandLayerProps) {
  const liveDataMap = usePegelstandLiveData(pegelstaende);

  const markers = useMemo(
    () =>
      pegelstaende.map((station) => {
        const live = liveDataMap.get(station.id!);
        return {
          ...station,
          live,
          color: live?.color || '#2196F3',
        };
      }),
    [pegelstaende, liveDataMap]
  );

  return (
    <LayerGroup
      attribution='Pegelst&auml;nde: <a href="https://wasser.bgld.gv.at" target="_blank" rel="noopener noreferrer">Wasserportal Burgenland</a> | <a href="https://www.noel.gv.at/wasserstand/" target="_blank" rel="noopener noreferrer">Land Nieder&ouml;sterreich</a> | <a href="https://www.hydrografie.steiermark.at/" target="_blank" rel="noopener noreferrer">Land Steiermark</a>'
    >
      {markers.map((m) => (
        <Marker
          position={[m.lat, m.lng]}
          icon={getWaterDropIcon(m.color)}
          key={`${m.type}-${m.id}`}
        >
          <Popup>
            <b>{m.name}</b>
            {m.rivername && (
              <>
                <br />
                <small>{m.rivername}</small>
              </>
            )}
            {m.live ? (
              <>
                {m.live.drainLevel && (
                  <>
                    <br />
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: m.live.color,
                        marginRight: 4,
                        verticalAlign: 'middle',
                      }}
                    />
                    {m.live.drainLevel}
                  </>
                )}
                {m.live.waterLevel && (
                  <>
                    <br />
                    Wasserstand: {m.live.waterLevel} {m.live.waterLevelUnit}
                  </>
                )}
                {m.live.waterLevelForecast && (
                  <>
                    <br />
                    Prognose: {m.live.waterLevelForecast}{' '}
                    {m.live.waterLevelUnit}
                  </>
                )}
                {m.live.discharge && (
                  <>
                    <br />
                    Abfluss: {m.live.discharge} m&sup3;/s
                  </>
                )}
                {m.live.dischargeForecast && (
                  <>
                    <br />
                    Abfluss-Prognose: {m.live.dischargeForecast} m&sup3;/s
                  </>
                )}
                {m.live.temperature && (
                  <>
                    <br />
                    Wassertemperatur: {m.live.temperature} &deg;C
                  </>
                )}
                {m.live.groundwaterLevel && (
                  <>
                    <br />
                    Grundwasser: {m.live.groundwaterLevel} m &uuml;.A.
                  </>
                )}
                {(m.live.precipitation3h ||
                  m.live.precipitation12h ||
                  m.live.precipitation24h) && (
                  <>
                    <br />
                    Niederschlag:
                    {m.live.precipitation3h &&
                      ` ${m.live.precipitation3h}mm/3h`}
                    {m.live.precipitation12h &&
                      ` ${m.live.precipitation12h}mm/12h`}
                    {m.live.precipitation24h &&
                      ` ${m.live.precipitation24h}mm/24h`}
                  </>
                )}
                {m.live.airTemperature && (
                  <>
                    <br />
                    Lufttemperatur: {m.live.airTemperature} &deg;C
                  </>
                )}
                {m.live.humidity && (
                  <>
                    <br />
                    Luftfeuchtigkeit: {m.live.humidity}%
                  </>
                )}
                {m.live.timestamp && (
                  <>
                    <br />
                    Stand: {m.live.timestamp}
                  </>
                )}
                <br />
                {m.live.source === 'noe' || m.live.source === 'stmk' ? (
                  <a
                    href={m.live.detailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Details &rarr;
                  </a>
                ) : (
                  <a
                    href={`https://wasser.bgld.gv.at${m.live.detailUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Details &rarr;
                  </a>
                )}
              </>
            ) : (
              <>
                <br />
                <span style={{ fontSize: '0.85em', color: '#666' }}>
                  Lade Pegelstanddaten...
                </span>
                <br />
                <a
                  href={
                    m.source === 'noe' || m.source === 'stmk'
                      ? m.detailUrl
                      : `https://wasser.bgld.gv.at${m.detailUrl}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Details &rarr;
                </a>
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
