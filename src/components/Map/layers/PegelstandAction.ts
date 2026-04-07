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
  source?: 'bgld' | 'noe' | 'stmk';
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

/** Max distance in km from the Burgenland border for neighboring stations */
const MAX_DISTANCE_KM = 50;

/** Reference points along the Burgenland border for distance calculation */
const BURGENLAND_BORDER_POINTS: [number, number][] = [
  // NÖ border (north/west)
  [48.02, 16.85], // Bruck an der Leitha (north)
  [47.94, 16.48], // Deutsch Brodersdorf
  [47.82, 16.27], // Wiener Neustadt
  [47.74, 16.22], // Lanzenkirchen
  [47.68, 16.14], // Gloggnitz area
  [47.58, 16.1], // Aspang area
  // Steiermark border (southwest)
  [47.5, 16.05], // Hochneukirchen
  [47.37, 16.12], // Pinkafeld area
  [47.29, 16.2], // Oberwart area
  [47.06, 16.32], // Güssing area
  [46.93, 16.14], // Jennersdorf (south)
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
      distanceToBurgenland(lat, lng) <= MAX_DISTANCE_KM
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

// ---------------------------------------------------------------------------
// Steiermark (HyDaVis) data source
// ---------------------------------------------------------------------------

const STMK_BASE_URL =
  'https://egov.stmk.gv.at/at.gv.stmk.hydavis-p/pub/praesentation/index.xhtml';

/** messcode values for Steiermark HyDaVis parameter types */
const STMK_PARAMS = {
  wasserstand: '2001',
  durchfluss: '2002',
} as const;

interface StmkStation {
  letzterMesswert: {
    dbmsnr: number;
    zeitpunkt: string; // "Feb 22, 2026, 6:00:00 PM"
    wert: number;
  };
  tagessumme?: number;
  zeigeSumme: boolean;
  hatGueltigenMesswert: boolean;
  dbmsnr: number;
  hdnr: string;
  mstnam: string;
  koordinatenLaenge: number;
  koordinatenBreite: number;
  utmo: number;
  utmn: number;
  owMq?: number;
  owGruen?: number;
  owGelb?: number;
  owRot?: number;
  gewaesser: string;
}

/** Extract the embedded JSON station array from HyDaVis HTML */
function parseStmkHtml(html: string): StmkStation[] {
  const match = html.match(/\[\{"letzterMesswert[^\]]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

/** Determine color from Durchfluss value vs thresholds */
function stmkColor(
  durchflussWert: number | undefined,
  station: StmkStation
): { color: string; drainLevel?: string } {
  const val = durchflussWert ?? station.letzterMesswert.wert;
  if (station.owRot && val >= station.owRot)
    return { color: '#ff0000', drainLevel: '> Rot' };
  if (station.owGelb && val >= station.owGelb)
    return { color: '#ff8c00', drainLevel: '> Gelb' };
  if (station.owGruen && val >= station.owGruen)
    return { color: '#ffff00', drainLevel: '> Grün' };
  if (station.owMq && val >= station.owMq)
    return { color: '#4169e1', drainLevel: '> MQ' };
  return { color: DEFAULT_COLOR };
}

/** Parse Steiermark Java-style timestamp "Feb 22, 2026, 6:00:00 PM" */
function parseStmkTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

async function fetchStmkPage(messcode: string): Promise<StmkStation[]> {
  try {
    const url = `${STMK_BASE_URL}?messcode=${messcode}&ansichtstyp=karte&stationsstatus=ONLINE`;
    const response = await fetch(url, {
      next: { revalidate: 300 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) {
      console.error(
        `Failed to fetch Stmk messcode=${messcode}: ${response.status}`
      );
      return [];
    }
    const html = await response.text();
    return parseStmkHtml(html);
  } catch (error) {
    console.error(`Failed to fetch Stmk messcode=${messcode}:`, error);
    return [];
  }
}

async function fetchStmkData(): Promise<PegelstandData[]> {
  const [wsStations, dfStations] = await Promise.all([
    fetchStmkPage(STMK_PARAMS.wasserstand),
    fetchStmkPage(STMK_PARAMS.durchfluss),
  ]);

  // Index Durchfluss by hdnr for merging with Wasserstand
  const dfByHdnr = new Map<string, StmkStation>();
  for (const s of dfStations) {
    dfByHdnr.set(s.hdnr, s);
  }

  // Use Wasserstand stations as base, merge Durchfluss where available
  const results: PegelstandData[] = [];
  const seenHdnr = new Set<string>();

  for (const ws of wsStations) {
    const lat = ws.koordinatenBreite;
    const lng = ws.koordinatenLaenge;
    if (distanceToBurgenland(lat, lng) > MAX_DISTANCE_KM) continue;

    seenHdnr.add(ws.hdnr);
    const df = dfByHdnr.get(ws.hdnr);
    const durchflussWert = df?.letzterMesswert.wert;
    const { color, drainLevel } = stmkColor(durchflussWert, ws);

    results.push({
      slug: `stmk-${ws.hdnr}`,
      name: ws.mstnam,
      type: 'river',
      timestamp: parseStmkTimestamp(ws.letzterMesswert.zeitpunkt),
      waterLevel: ws.hatGueltigenMesswert
        ? String(Math.round(ws.letzterMesswert.wert))
        : undefined,
      waterLevelUnit: 'cm',
      discharge: df?.hatGueltigenMesswert
        ? String(Math.round(df.letzterMesswert.wert * 100) / 100)
        : undefined,
      temperature: undefined,
      color,
      drainLevel,
      detailUrl: `https://egov.stmk.gv.at/at.gv.stmk.hydavis-p/pub/praesentation/index.xhtml?messcode=2001&ansichtstyp=einzelstation&hdnr=${ws.hdnr}`,
      source: 'stmk',
      lat,
      lng,
      rivername: ws.gewaesser,
    });
  }

  // Add Durchfluss-only stations not in Wasserstand list
  for (const df of dfStations) {
    if (seenHdnr.has(df.hdnr)) continue;
    const lat = df.koordinatenBreite;
    const lng = df.koordinatenLaenge;
    if (distanceToBurgenland(lat, lng) > MAX_DISTANCE_KM) continue;

    const { color, drainLevel } = stmkColor(df.letzterMesswert.wert, df);

    results.push({
      slug: `stmk-${df.hdnr}`,
      name: df.mstnam,
      type: 'river',
      timestamp: parseStmkTimestamp(df.letzterMesswert.zeitpunkt),
      waterLevel: undefined,
      waterLevelUnit: 'cm',
      discharge: df.hatGueltigenMesswert
        ? String(Math.round(df.letzterMesswert.wert * 100) / 100)
        : undefined,
      temperature: undefined,
      color,
      drainLevel,
      detailUrl: `https://egov.stmk.gv.at/at.gv.stmk.hydavis-p/pub/praesentation/index.xhtml?messcode=2002&ansichtstyp=einzelstation&hdnr=${df.hdnr}`,
      source: 'stmk',
      lat,
      lng,
      rivername: df.gewaesser,
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
    const [riverResponse, lakeResponse, noeData, stmkData] =
      await Promise.all([
        fetch(RIVER_URL, { next: { revalidate: 300 } }),
        fetch(LAKE_URL, { next: { revalidate: 300 } }),
        fetchNoeData(),
        fetchStmkData(),
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
    results.push(...stmkData);

    return results;
  } catch (error) {
    console.error('Failed to fetch Pegelstand data:', error);
    return [];
  }
}
