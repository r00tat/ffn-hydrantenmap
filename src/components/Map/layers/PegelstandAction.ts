'use server';

import { actionUserRequired } from '../../../app/auth';

export interface PegelstandData {
  slug: string;
  name: string;
  type: 'river' | 'lake';
  timestamp: string;
  waterLevel?: string;
  waterLevelUnit: string;
  discharge?: string;
  temperature?: string;
  color: string;
  /** Human-readable drain level label, e.g. "MQ-HQ1" (rivers only) */
  drainLevel?: string;
  detailUrl: string;
  /** Data source: 'bgld' for Burgenland, 'noe' for Niederösterreich */
  source?: 'bgld' | 'noe';
  /** Coordinates (NÖ entries carry these directly; Bgld uses Firestore lookup) */
  lat?: number;
  lng?: number;
  /** River name from NÖ API */
  rivername?: string;
  /** NÖ-specific measurement fields (all parameter types) */
  waterLevelForecast?: string;
  dischargeForecast?: string;
  groundwaterLevel?: string;
  precipitation3h?: string;
  precipitation12h?: string;
  precipitation24h?: string;
  airTemperature?: string;
  humidity?: string;
}

const DEFAULT_COLOR = '#2196F3';

/** Drain CSS classes → hex colors from the site's hydrography.css */
const DRAIN_COLORS: Record<string, string> = {
  'drain-Q95': '#8a4705',
  'drain-MQ-Q95': '#00fb84',
  'drain-HQ1-MQ': '#007e00',
  'drain-HQ5-HQ1': '#0085ff',
  'drain-HQ10-HQ5': '#ffe25f',
  'drain-HQ30-HQ10': '#ff8400',
  'drain-HQ100-HQ30': '#ff2300',
  'drain-HQ100': '#c31e09',
};

/** Drain class → human-readable label for the popup */
const DRAIN_LABELS: Record<string, string> = {
  'drain-Q95': '<Q95%',
  'drain-MQ-Q95': 'Q95%-MQ',
  'drain-HQ1-MQ': 'MQ-HQ1',
  'drain-HQ5-HQ1': 'HQ1-HQ5',
  'drain-HQ10-HQ5': 'HQ5-HQ10',
  'drain-HQ30-HQ10': 'HQ10-HQ30',
  'drain-HQ100-HQ30': 'HQ30-HQ100',
  'drain-HQ100': '>HQ100',
};

const RIVER_URL = 'https://wasser.bgld.gv.at/hydrographie/die-fluesse';
const LAKE_URL = 'https://wasser.bgld.gv.at/hydrographie/die-seen';

const NOE_MAPLIST_URL =
  'https://www.noel.gv.at/wasserstand/kidata/maplist/MapList.json';

/** Max distance in km from the Burgenland border for NÖ stations */
const NOE_MAX_DISTANCE_KM = 50;

/** Reference points along the Burgenland-NÖ border for distance calculation */
const BURGENLAND_BORDER_POINTS: [number, number][] = [
  [48.02, 16.85], // Bruck an der Leitha (north)
  [47.94, 16.48], // Deutsch Brodersdorf
  [47.82, 16.27], // Wiener Neustadt
  [47.74, 16.22], // Lanzenkirchen
  [47.68, 16.14], // Gloggnitz area
  [47.58, 16.1], // Aspang area
  [47.5, 16.05], // Hochneukirchen (south)
];

/** Haversine distance in km between two lat/lng points */
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

/** Minimum distance from a point to the Burgenland border reference points */
function distanceToBurgenland(lat: number, lng: number): number {
  return Math.min(
    ...BURGENLAND_BORDER_POINTS.map(([bLat, bLng]) =>
      haversineDistance(lat, lng, bLat, bLng)
    )
  );
}

interface NoeMapListEntry {
  Parameter: string;
  Stationnumber: string;
  Stationname: string;
  Timestamp: string;
  Value: string;
  Unit: string;
  ClassID: string;
  Class: string;
  TextColor: string;
  Lat: string;
  Long: string;
  Linkparameter: string;
  Grafik: string;
  Rivername: string;
  HydroUnit: string;
  Catchment: string;
}

/** NÖ alert level ClassID → human-readable label */
const NOE_DRAIN_LABELS: Record<string, string> = {
  '1': '< MW',
  '2': '> MW',
  '3': '> HW1',
  '4': '> HW5',
  '5': '> HW30',
};

async function fetchNoeData(): Promise<PegelstandData[]> {
  const response = await fetch(NOE_MAPLIST_URL, { next: { revalidate: 300 } });
  if (!response.ok) {
    console.error(
      `Failed to fetch NÖ data: ${response.status} ${response.statusText}`
    );
    return [];
  }

  const entries: NoeMapListEntry[] = await response.json();

  // Filter by distance to Burgenland border
  const filtered = entries.filter((e) => {
    const lat = parseFloat(e.Lat);
    const lng = parseFloat(e.Long);
    return (
      !isNaN(lat) &&
      !isNaN(lng) &&
      distanceToBurgenland(lat, lng) <= NOE_MAX_DISTANCE_KM
    );
  });

  // Group by station number
  const stationGroups = new Map<string, NoeMapListEntry[]>();
  for (const entry of filtered) {
    const group = stationGroups.get(entry.Stationnumber) || [];
    group.push(entry);
    stationGroups.set(entry.Stationnumber, group);
  }

  // Convert each station group to a PegelstandData entry
  const results: PegelstandData[] = [];
  for (const [stationNumber, group] of stationGroups) {
    const byParam = new Map<string, NoeMapListEntry>();
    for (const e of group) {
      byParam.set(e.Parameter, e);
    }

    // Use first entry for common fields
    const first = group[0];
    const lat = parseFloat(first.Lat);
    const lng = parseFloat(first.Long);

    // Determine color from Wasserstand > Durchfluss > default
    const wsEntry =
      byParam.get('Wasserstand') || byParam.get('WasserstandPrognose');
    const dfEntry =
      byParam.get('Durchfluss') || byParam.get('DurchflussPrognose');
    const colorSource = wsEntry || dfEntry || first;
    const classId = colorSource.ClassID;
    // ClassID 0 returns #ffffff (white) which is invisible on the map
    const color =
      classId && classId !== '0' && colorSource.Class
        ? colorSource.Class
        : DEFAULT_COLOR;
    const drainLevel =
      classId && classId !== '0' ? NOE_DRAIN_LABELS[classId] : undefined;

    // Pick the most recent timestamp from all parameters
    const timestamps = group
      .map((e) => e.Timestamp)
      .filter(Boolean)
      .sort()
      .reverse();
    const timestamp = timestamps[0]
      ? new Date(timestamps[0]).toLocaleString('de-AT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

    results.push({
      slug: `noe-${stationNumber}`,
      name: first.Stationname,
      type: 'river', // NÖ doesn't distinguish river/lake in this API
      timestamp,
      waterLevel: byParam.get('Wasserstand')?.Value,
      waterLevelUnit: byParam.get('Wasserstand')?.Unit || 'cm',
      waterLevelForecast: byParam.get('WasserstandPrognose')?.Value,
      discharge: byParam.get('Durchfluss')?.Value,
      dischargeForecast: byParam.get('DurchflussPrognose')?.Value,
      temperature: byParam.get('Wassertemperatur')?.Value,
      groundwaterLevel: byParam.get('Grundwasserspiegel')?.Value,
      precipitation3h: byParam.get('Niederschlag03h')?.Value,
      precipitation12h: byParam.get('Niederschlag12h')?.Value,
      precipitation24h: byParam.get('Niederschlag24h')?.Value,
      airTemperature: byParam.get('Lufttemperatur')?.Value,
      humidity: byParam.get('Luftfeuchtigkeit')?.Value,
      color,
      drainLevel,
      detailUrl: `https://www.noel.gv.at/wasserstand/#/de/Messstellen/Details/${stationNumber}/${first.Linkparameter || 'Wasserstand'}/${first.Grafik || '3Tage'}`,
      source: 'noe',
      lat,
      lng,
      rivername: first.Rivername,
    });
  }

  return results;
}

/**
 * Build a slug→drain-class map from the interactive map section of the page.
 * Map station records look like:
 *   <a class="station_map_record drain-HQ1-MQ ..." href="/hydrographie/die-fluesse/burg">
 */
function parseMapDrainClasses(
  html: string,
  pathPrefix: string
): Map<string, string> {
  const map = new Map<string, string>();
  const regex = new RegExp(
    `station_map_record[\\s\\S]*?(drain-[A-Za-z0-9-]+)[\\s\\S]*?href="${pathPrefix}/([^"]+)"`,
    'gi'
  );
  let m;
  while ((m = regex.exec(html)) !== null) {
    map.set(m[2], m[1]);
  }
  return map;
}

function parseRiverPage(html: string): PegelstandData[] {
  const results: PegelstandData[] = [];

  // Extract drain classes from the map section (slug → drain class)
  const drainMap = parseMapDrainClasses(
    html,
    '/hydrographie/die-fluesse'
  );

  // Match table rows containing station data
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Check if this row contains a link to a river station
    const linkMatch = rowHtml.match(
      /<a[^>]*href="\/hydrographie\/die-fluesse\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const slug = linkMatch[1];
    const name = linkMatch[2].replace(/<[^>]*>/g, '').trim();

    // Extract all table cells
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // Look up color from the drain class extracted from the map section
    const drainClass = drainMap.get(slug);
    const color = (drainClass && DRAIN_COLORS[drainClass]) || DEFAULT_COLOR;
    const drainLevel = drainClass ? DRAIN_LABELS[drainClass] : undefined;

    // River rows: [station name, timestamp, discharge Q (m3/s), water level (cm), temperature (C)]
    if (cells.length >= 4) {
      const timestamp = cells[1]?.replace(/\s+/g, ' ').trim() || '';
      const discharge = cells[2] || undefined;
      const waterLevel = cells[3] || undefined;
      const temperature = cells.length >= 5 && cells[4] ? cells[4] : undefined;

      results.push({
        slug,
        name,
        type: 'river',
        timestamp,
        waterLevel,
        waterLevelUnit: 'cm',
        discharge: discharge || undefined,
        temperature: temperature || undefined,
        color,
        drainLevel,
        detailUrl: `/hydrographie/die-fluesse/${slug}`,
        source: 'bgld',
      });
    }
  }

  return results;
}

function parseLakePage(html: string): PegelstandData[] {
  const results: PegelstandData[] = [];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Check if this row contains a link to a lake station
    const linkMatch = rowHtml.match(
      /<a[^>]*href="\/hydrographie\/die-seen\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!linkMatch) continue;

    const slug = linkMatch[1];
    const name = linkMatch[2].replace(/<[^>]*>/g, '').trim();

    // Extract all table cells
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // Lake rows: [station name, timestamp, water level (müA), temperature (C)]
    if (cells.length >= 3) {
      const timestamp = cells[1]?.replace(/\s+/g, ' ').trim() || '';
      const waterLevel = cells[2] || undefined;
      const temperature = cells.length >= 4 && cells[3] ? cells[3] : undefined;

      results.push({
        slug,
        name,
        type: 'lake',
        timestamp,
        waterLevel,
        waterLevelUnit: 'müA',
        discharge: undefined,
        temperature: temperature || undefined,
        color: DEFAULT_COLOR,
        detailUrl: `/hydrographie/die-seen/${slug}`,
        source: 'bgld',
      });
    }
  }

  return results;
}

export async function fetchPegelstandData(): Promise<PegelstandData[]> {
  await actionUserRequired();

  try {
    const [riverResponse, lakeResponse, noeData] = await Promise.all([
      fetch(RIVER_URL, { next: { revalidate: 300 } }),
      fetch(LAKE_URL, { next: { revalidate: 300 } }),
      fetchNoeData(),
    ]);

    const results: PegelstandData[] = [];

    if (riverResponse.ok) {
      const riverHtml = await riverResponse.text();
      results.push(...parseRiverPage(riverHtml));
    } else {
      console.error(
        `Failed to fetch river data: ${riverResponse.status} ${riverResponse.statusText}`
      );
    }

    if (lakeResponse.ok) {
      const lakeHtml = await lakeResponse.text();
      results.push(...parseLakePage(lakeHtml));
    } else {
      console.error(
        `Failed to fetch lake data: ${lakeResponse.status} ${lakeResponse.statusText}`
      );
    }

    results.push(...noeData);

    return results;
  } catch (error) {
    console.error('Failed to fetch Pegelstand data:', error);
    return [];
  }
}
