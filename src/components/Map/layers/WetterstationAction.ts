'use server';

import { actionUserRequired } from '../../../app/auth';

export interface WetterstationLiveData {
  stationId: string;
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

const DATA_URL =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min';
const PARAMETERS = 'TL,FF,FFX,DD,RF,P,RR,SCHNEE,SO,GLOW';

interface ParameterValue {
  name: string;
  unit: string;
  data: (number | null)[];
}

interface TawesFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
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

function getParamValue(
  params: Record<string, ParameterValue>,
  key: string
): number | null {
  const p = params[key];
  if (!p?.data?.length) return null;
  for (let i = p.data.length - 1; i >= 0; i--) {
    if (p.data[i] !== null) return p.data[i];
  }
  return null;
}

export async function fetchWetterstationLiveData(
  stationIds: string[]
): Promise<WetterstationLiveData[]> {
  await actionUserRequired();

  if (stationIds.length === 0) return [];

  try {
    const ids = stationIds.join(',');
    const url = `${DATA_URL}?parameters=${PARAMETERS}&station_ids=${ids}&output_format=geojson`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) {
      console.error(`TAWES data fetch failed: ${response.status}`);
      return [];
    }

    const geojson: TawesGeoJSON = await response.json();
    const lastIndex =
      geojson.timestamps?.length > 0 ? geojson.timestamps.length - 1 : -1;
    const timestamp = lastIndex >= 0 ? geojson.timestamps[lastIndex] : '';

    return geojson.features.map((feature) => {
      const params = feature.properties.parameters;
      return {
        stationId: feature.properties.station,
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
    });
  } catch (error) {
    console.error('Failed to fetch Wetterstation live data:', error);
    return [];
  }
}
