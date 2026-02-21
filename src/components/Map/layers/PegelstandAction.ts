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
  detailUrl: string;
}

const DEFAULT_COLOR = '#2196F3';

const RIVER_URL = 'https://wasser.bgld.gv.at/hydrographie/die-fluesse';
const LAKE_URL = 'https://wasser.bgld.gv.at/hydrographie/die-seen';

function parseRiverPage(html: string): PegelstandData[] {
  const results: PegelstandData[] = [];

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

    // Try to extract color from the row or cell styles
    const colorMatch = rowHtml.match(
      /(?:background-color|color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgb[^)]*\))/i
    );
    const color = colorMatch ? colorMatch[1] : DEFAULT_COLOR;

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

    // Try to extract color from the row or cell styles
    const colorMatch = rowHtml.match(
      /(?:background-color|color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgb[^)]*\))/i
    );
    const color = colorMatch ? colorMatch[1] : DEFAULT_COLOR;

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
        color,
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
