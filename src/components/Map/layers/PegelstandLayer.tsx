'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';
import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import { fetchPegelstandData, PegelstandData } from './PegelstandAction';

export interface PegelstandStation {
  id: string;
  name: string;
  type: 'river' | 'lake';
  hzbnr?: string;
  lat: number;
  lng: number;
  detailUrl: string;
}

interface PegelstandMarkerData extends PegelstandData {
  lat: number;
  lng: number;
}

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

function usePegelstandData() {
  const [data, setData] = useState<PegelstandData[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const refresh = async () => {
      try {
        const result = await fetchPegelstandData();
        if (mountedRef.current) {
          setData(result);
        }
      } catch (err) {
        console.error('Failed to fetch Pegelstand data', err);
      }
    };

    refresh();
    const interval = setInterval(refresh, 300000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return data;
}

export default function PegelstandLayer() {
  const liveData = usePegelstandData();
  const stations = useFirebaseCollection<PegelstandStation>({
    collectionName: 'pegelstand_stations',
  });

  const markers = useMemo<PegelstandMarkerData[]>(() => {
    const stationMap = new Map<string, PegelstandStation>();
    for (const station of stations) {
      stationMap.set(station.id, station);
    }

    return liveData
      .map((entry) => {
        // NÖ and Stmk entries carry coordinates directly
        if ((entry.source === 'noe' || entry.source === 'stmk') && entry.lat && entry.lng) {
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

  return (
    <LayerGroup
      attribution='Pegelst&auml;nde: <a href="https://wasser.bgld.gv.at" target="_blank" rel="noopener noreferrer">Wasserportal Burgenland</a> | <a href="https://www.noel.gv.at/wasserstand/" target="_blank" rel="noopener noreferrer">Land Nieder&ouml;sterreich</a> | <a href="https://www.hydrografie.steiermark.at/" target="_blank" rel="noopener noreferrer">Land Steiermark</a>'
    >
      {markers.map((marker) => (
        <Marker
          position={[marker.lat, marker.lng]}
          icon={getWaterDropIcon(marker.color)}
          key={`${marker.type}-${marker.slug}`}
        >
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
            {(marker.precipitation3h ||
              marker.precipitation12h ||
              marker.precipitation24h) && (
              <>
                <br />
                Niederschlag:
                {marker.precipitation3h &&
                  ` ${marker.precipitation3h}mm/3h`}
                {marker.precipitation12h &&
                  ` ${marker.precipitation12h}mm/12h`}
                {marker.precipitation24h &&
                  ` ${marker.precipitation24h}mm/24h`}
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
            {marker.source === 'noe' || marker.source === 'stmk' ? (
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
        </Marker>
      ))}
    </LayerGroup>
  );
}
