'use client';

import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import {
  fetchPowerOutageData,
  PowerOutage,
} from './PowerOutageAction';

const LAYER_NAME = 'Stromausfälle';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const powerOutageIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="#d32f2f" stroke="#fff" stroke-width="1"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

function usePowerOutageData() {
  const [outages, setOutages] = useState<PowerOutage[]>([]);
  const [visible, setVisible] = useState(false);
  const lastFetchRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const map = useMap();

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

  useEffect(() => {
    mountedRef.current = true;
    if (!visible) return;

    const refresh = async () => {
      try {
        const data = await fetchPowerOutageData();
        if (mountedRef.current) {
          setOutages(data);
          lastFetchRef.current = Date.now();
        }
      } catch (err) {
        console.error('Failed to fetch power outage data', err);
      }
    };

    const age = Date.now() - lastFetchRef.current;
    if (age >= CACHE_TTL_MS) {
      refresh();
    }

    const interval = setInterval(refresh, CACHE_TTL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [visible]);

  return outages;
}

function formatOutageTime(dateStr: string): string {
  if (!dateStr || dateStr.startsWith('31.12.2099')) return '';
  return dateStr;
}

export default function PowerOutageLayer() {
  const outages = usePowerOutageData();

  return (
    <LayerGroup
      attribution='Störungsinfo: <a href="https://analytics.netzburgenland.at/stoerungsinfo" target="_blank" rel="noopener noreferrer">Netz Burgenland</a>'
    >
      {outages.map((outage) => (
        <Marker
          position={[outage.lat, outage.lng]}
          icon={powerOutageIcon}
          key={outage.id}
        >
          <Popup>
            <b>{outage.stationBezeichnung}</b>
            <br />
            {outage.netzgemeinde} ({outage.netzbezirk})
            <br />
            {outage.anlass}
            <br />
            Netz: {outage.netz}
            <br />
            Beginn: {formatOutageTime(outage.ausfallBeginn)}
            {formatOutageTime(outage.ausfallEnde) && (
              <>
                <br />
                Ende: {formatOutageTime(outage.ausfallEnde)}
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
