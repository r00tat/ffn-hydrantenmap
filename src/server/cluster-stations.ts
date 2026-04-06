import { geohashForLocation } from 'geofire-common';
import {
  GEOHASH_PRECISION,
  GeohashCluster,
  PegelstandRecord,
  WetterstationRecord,
  WgsObject,
} from '../common/gis-objects';
import { firestore } from './firebase/admin';

type GeohashMap = Record<string, GeohashCluster>;

// Bounding box for Burgenland + nearby area
const LAT_MIN = 46.8;
const LAT_MAX = 48.2;
const LON_MIN = 15.8;
const LON_MAX = 17.2;

const METADATA_URL =
  'https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata';

const NOE_MAPLIST_URL =
  'https://www.noel.gv.at/wasserstand/kidata/maplist/MapList.json';

const STMK_BASE_URL =
  'https://egov.stmk.gv.at/at.gv.stmk.hydavis-p/pub/praesentation/index.xhtml';

/** Max distance in km from the Burgenland border for neighboring stations */
const MAX_DISTANCE_KM = 50;

/** Reference points along the Burgenland border for distance calculation */
const BURGENLAND_BORDER_POINTS: [number, number][] = [
  [48.02, 16.85],
  [47.94, 16.48],
  [47.82, 16.27],
  [47.74, 16.22],
  [47.68, 16.14],
  [47.58, 16.1],
  [47.5, 16.05],
  [47.37, 16.12],
  [47.29, 16.2],
  [47.06, 16.32],
  [46.93, 16.14],
];

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distanceToBurgenland(lat: number, lng: number): number {
  return Math.min(
    ...BURGENLAND_BORDER_POINTS.map(([bLat, bLng]) =>
      haversineDistance(lat, lng, bLat, bLng)
    )
  );
}

function upsertRecord<T extends WgsObject>(
  geohashes: GeohashMap,
  field: string,
  record: T
) {
  const hash = geohashForLocation(
    [record.lat || 0, record.lng || 0],
    GEOHASH_PRECISION
  );
  if (!geohashes[hash]) {
    geohashes[hash] = { hydranten: [], geohash: hash };
  }
  if (!geohashes[hash][field]) {
    geohashes[hash][field] = [];
  }
  const existing = (geohashes[hash][field] as WgsObject[]).find(
    (v) => v.id === record.id
  );
  if (existing) {
    Object.assign(existing, record);
  } else {
    (geohashes[hash][field] as WgsObject[]).push(record);
  }
}

/**
 * Import Wetterstationen metadata from GeoSphere TAWES API into cluster map.
 */
export async function importWetterstationen(
  geohashes: GeohashMap
): Promise<number> {
  try {
    const response = await fetch(METADATA_URL);
    if (!response.ok) {
      console.error(`TAWES metadata fetch failed: ${response.status}`);
      return 0;
    }

    const metadata = await response.json();
    const stations = (metadata.stations || []).filter(
      (s: any) =>
        s.is_active &&
        (s.state === 'Burgenland' ||
          (s.lat >= LAT_MIN &&
            s.lat <= LAT_MAX &&
            s.lon >= LON_MIN &&
            s.lon <= LON_MAX))
    );

    for (const station of stations) {
      const record: WetterstationRecord = {
        id: station.id,
        name: station.name,
        lat: station.lat,
        lng: station.lon,
        altitude: station.altitude,
        state: station.state,
      };
      upsertRecord(geohashes, 'wetterstationen', record);
    }

    return stations.length;
  } catch (error) {
    console.error('Failed to import Wetterstationen:', error);
    return 0;
  }
}

/**
 * Import Pegelstand station positions from all sources into cluster map.
 */
export async function importPegelstaende(
  geohashes: GeohashMap
): Promise<number> {
  let count = 0;

  // Burgenland: from Firestore pegelstand_stations
  try {
    const snapshot = await firestore.collection('pegelstand_stations').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.lat || !data.lng) continue;
      const record: PegelstandRecord = {
        id: doc.id,
        name: data.name || doc.id,
        lat: data.lat,
        lng: data.lng,
        type: data.type || 'river',
        source: 'bgld',
        detailUrl: data.detailUrl || '',
        rivername: data.rivername,
      };
      upsertRecord(geohashes, 'pegelstaende', record);
      count++;
    }
  } catch (error) {
    console.error('Failed to import Bgld Pegelstände:', error);
  }

  // NÖ: from MapList.json
  try {
    const response = await fetch(NOE_MAPLIST_URL);
    if (response.ok) {
      const entries: any[] = await response.json();
      // Group by station number, take first entry for coordinates
      const seen = new Set<string>();
      for (const entry of entries) {
        const stationNumber = entry.Stationnumber;
        if (seen.has(stationNumber)) continue;
        seen.add(stationNumber);

        const lat = parseFloat(entry.Lat);
        const lng = parseFloat(entry.Long);
        if (isNaN(lat) || isNaN(lng)) continue;
        if (distanceToBurgenland(lat, lng) > MAX_DISTANCE_KM) continue;

        const record: PegelstandRecord = {
          id: `noe-${stationNumber}`,
          name: entry.Stationname,
          lat,
          lng,
          type: 'river',
          source: 'noe',
          detailUrl: `https://www.noel.gv.at/wasserstand/#/de/Messstellen/Details/${stationNumber}/${entry.Linkparameter || 'Wasserstand'}/${entry.Grafik || '3Tage'}`,
          rivername: entry.Rivername,
        };
        upsertRecord(geohashes, 'pegelstaende', record);
        count++;
      }
    }
  } catch (error) {
    console.error('Failed to import NÖ Pegelstände:', error);
  }

  // Steiermark: from HyDaVis
  try {
    const url = `${STMK_BASE_URL}?messcode=2001&ansichtstyp=karte&stationsstatus=ONLINE`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/\[\{"letzterMesswert[^\]]*\]/);
      if (match) {
        try {
          const stations: any[] = JSON.parse(match[0]);
          for (const station of stations) {
            const lat = station.koordinatenBreite;
            const lng = station.koordinatenLaenge;
            if (!lat || !lng) continue;
            if (distanceToBurgenland(lat, lng) > MAX_DISTANCE_KM) continue;

            const record: PegelstandRecord = {
              id: `stmk-${station.hdnr}`,
              name: station.mstnam,
              lat,
              lng,
              type: 'river',
              source: 'stmk',
              detailUrl: `https://egov.stmk.gv.at/at.gv.stmk.hydavis-p/pub/praesentation/index.xhtml?messcode=2001&ansichtstyp=einzelstation&hdnr=${station.hdnr}`,
              rivername: station.gewaesser,
            };
            upsertRecord(geohashes, 'pegelstaende', record);
            count++;
          }
        } catch {
          console.error('Failed to parse Stmk station JSON');
        }
      }
    }
  } catch (error) {
    console.error('Failed to import Stmk Pegelstände:', error);
  }

  return count;
}
