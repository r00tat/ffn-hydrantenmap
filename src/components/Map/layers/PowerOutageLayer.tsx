'use client';

import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { LayerGroup, Marker, Popup } from 'react-leaflet';
import {
  fetchPowerOutageData,
  PowerOutage,
} from './PowerOutageAction';

const powerOutageIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="#d32f2f" stroke="#fff" stroke-width="1"><path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/></svg>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

function usePowerOutageData() {
  const [outages, setOutages] = useState<PowerOutage[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const refresh = async () => {
      try {
        const data = await fetchPowerOutageData();
        if (mountedRef.current) {
          setOutages(data);
        }
      } catch (err) {
        console.error('Failed to fetch power outage data', err);
      }
    };

    refresh();
    const interval = setInterval(refresh, 120000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

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
