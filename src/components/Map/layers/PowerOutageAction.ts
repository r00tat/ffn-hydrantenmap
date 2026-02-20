'use server';

import { actionUserRequired } from '../../../app/auth';

export interface PowerOutage {
  id: string;
  lat: number;
  lng: number;
  netz: string;
  anlass: string;
  ausfallBeginn: string;
  ausfallEnde: string;
  netzbezirk: string;
  netzgemeinde: string;
  stationBezeichnung: string;
  stationNummer: string;
}

/**
 * Convert EPSG:3857 (Web Mercator) coordinates to WGS84 (lat/lng).
 */
function epsg3857ToWgs84(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  const lat =
    (Math.atan(Math.exp((y / 20037508.34) * Math.PI)) * 2 - Math.PI / 2) *
    (180 / Math.PI);
  return [lat, lng];
}

export async function fetchPowerOutageData(): Promise<PowerOutage[]> {
  await actionUserRequired();

  const response = await fetch(
    'https://analytics.netzburgenland.at/mapviewer/dataserver/nommaps',
    {
      method: 'POST',
      headers: {
        Accept: 'text/plain, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://analytics.netzburgenland.at',
        Referer: 'https://analytics.netzburgenland.at/stoerungsinfo',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: 't=THEME_STOERUNGEN&bbox=1511790.3047901045%2C5588775.918707911%2C2177709.6952098957%2C6451224.081292088&include_label_box=true&to_srid=3857&bbox_srid=3857&refresh=20079',
      next: { revalidate: 120 },
    }
  );

  if (!response.ok) {
    console.error(
      `Failed to fetch power outage data: ${response.status} ${response.statusText}`
    );
    return [];
  }

  const data = await response.json();

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    console.error('Unexpected power outage response format');
    return [];
  }

  return data.features
    .map(
      (feature: {
        _id: string;
        geometry: { coordinates: number[] };
        properties: Record<string, string>;
      }) => {
        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;

        const [lat, lng] = epsg3857ToWgs84(coords[0], coords[1]);
        const props = feature.properties;

        return {
          id: feature._id,
          lat,
          lng,
          netz: props.NETZ || '',
          anlass: props.ANLASS || '',
          ausfallBeginn: props.AUSFALL_BEGINN || '',
          ausfallEnde: props.AUSFALL_ENDE || '',
          netzbezirk: props.NETZBEZIRK || '',
          netzgemeinde: props.NETZGEMEINDE || '',
          stationBezeichnung: props.STATION_BEZEICHNUNG || '',
          stationNummer: props.STATION_NUMMER || '',
        } satisfies PowerOutage;
      }
    )
    .filter(Boolean) as PowerOutage[];
}
