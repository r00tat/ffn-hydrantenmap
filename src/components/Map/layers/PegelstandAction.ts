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
      });
    }
  }

  return results;
}

export async function fetchPegelstandData(): Promise<PegelstandData[]> {
  await actionUserRequired();

  try {
    const [riverResponse, lakeResponse] = await Promise.all([
      fetch(RIVER_URL, { next: { revalidate: 300 } }),
      fetch(LAKE_URL, { next: { revalidate: 300 } }),
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

    return results;
  } catch (error) {
    console.error('Failed to fetch Pegelstand data:', error);
    return [];
  }
}
