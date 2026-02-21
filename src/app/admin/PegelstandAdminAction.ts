'use server';

import { firestore } from '../../server/firebase/admin';
import { actionAdminRequired } from '../auth';

export interface OgcStation {
  hzbnr: string;
  name: string;
  river: string;
  lat: number;
  lng: number;
}

export interface PegelstandStationDoc {
  name: string;
  type: 'river' | 'lake';
  hzbnr?: string;
  lat: number;
  lng: number;
  detailUrl: string;
}

export async function fetchOgcStations(): Promise<OgcStation[]> {
  await actionAdminRequired();

  try {
    const response = await fetch(
      'https://gis.lfrz.gv.at/api/geodata/i000501/ogc/features/v1/collections/i000501:messstellen_owf/items?f=json&limit=200&bbox=15.8,46.8,17.2,48.2'
    );

    if (!response.ok) {
      throw new Error(
        `OGC API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const stations: OgcStation[] = (data.features || [])
      .filter(
        (feature: any) =>
          feature.properties?.hzbnr01 &&
          String(feature.properties.hzbnr01).startsWith('21')
      )
      .map((feature: any) => ({
        hzbnr: String(feature.properties.hzbnr01),
        name: String(feature.properties.mstnam02 || ''),
        river: String(feature.properties.gew03 || ''),
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
      }));

    return stations;
  } catch (error) {
    console.error('Failed to fetch OGC stations:', error);
    throw error;
  }
}

export async function savePegelstandStation(
  slug: string,
  station: PegelstandStationDoc
): Promise<void> {
  await actionAdminRequired();

  await firestore
    .collection('pegelstand_stations')
    .doc(slug)
    .set(station, { merge: true });
}

export async function deletePegelstandStation(slug: string): Promise<void> {
  await actionAdminRequired();

  await firestore.collection('pegelstand_stations').doc(slug).delete();
}

/**
 * Try to match a scraped station name to an OGC station.
 * OGC names look like "Burg" or "Deutsch-Jahrndorf (Neurießäcker)"
 * Scraped names look like "Burg / Pinka" or "Dt. Jahrndorf KL / Kleine Leitha"
 */
function findOgcMatch(
  scrapedName: string,
  ogcStations: OgcStation[]
): OgcStation | undefined {
  const scrapedLower = scrapedName.toLowerCase();
  const scrapedLocation = scrapedLower.split(' / ')[0].trim();
  // Also try without common abbreviations
  const scrapedNormalized = scrapedLocation
    .replace(/\bdt\.\s*/g, 'deutsch-')
    .replace(/\bst\.\s*/g, 'st. ')
    .replace(/\ba\.\s*d\.\s*/g, 'a. d. ')
    .replace(/\s+/g, ' ');

  return ogcStations.find((ogc) => {
    const ogcLower = ogc.name.toLowerCase();
    const ogcLocation = ogcLower.split(' (')[0].trim();

    // Exact location match
    if (scrapedLocation === ogcLocation) return true;
    // Normalized match
    if (scrapedNormalized === ogcLocation) return true;
    // One contains the other
    if (ogcLocation.includes(scrapedLocation)) return true;
    if (scrapedLocation.includes(ogcLocation)) return true;
    // Full name containment
    if (scrapedLower.includes(ogcLower)) return true;
    if (ogcLower.includes(scrapedLower)) return true;

    return false;
  });
}

export interface DetailPageData {
  lat: number;
  lng: number;
  hzbnr?: string;
}

/**
 * Parse coordinates and HZBNR from a station detail page.
 * Coordinates: <div id="StationMap" data-center='[lng,lat]'>
 * HZBNR: <p>HZBNR: 210260</p>
 */
function parseDetailPage(html: string): DetailPageData | null {
  const centerMatch = html.match(
    /id="StationMap"\s+data-center='?\[([^\]]+)\]/
  );
  if (!centerMatch) return null;

  const [lngStr, latStr] = centerMatch[1].split(',');
  const lng = parseFloat(lngStr);
  const lat = parseFloat(latStr);
  if (isNaN(lat) || isNaN(lng)) return null;

  const hzbnrMatch = html.match(/HZBNR:\s*(\d+)/);
  const hzbnr = hzbnrMatch ? hzbnrMatch[1] : undefined;

  return { lat, lng, hzbnr };
}

const BASE_URL = 'https://wasser.bgld.gv.at';

async function fetchDetailPageData(
  detailUrl: string
): Promise<DetailPageData | null> {
  try {
    const response = await fetch(`${BASE_URL}${detailUrl}`);
    if (!response.ok) return null;
    const html = await response.text();
    return parseDetailPage(html);
  } catch {
    return null;
  }
}

export interface ImportResult {
  total: number;
  withCoordinates: number;
  withoutCoordinates: number;
  fromDetailPages: number;
}

/**
 * Import ALL scraped stations to Firestore.
 * 1. Stations that already have coordinates in Firestore keep them (metadata updated).
 * 2. For new/missing coordinates: fetch detail page first (exact per-station coordinates).
 * 3. Fallback to OGC API match if detail page has no coordinates.
 */
export async function importAllStations(
  ogcStations: OgcStation[],
  scrapedStations: {
    slug: string;
    name: string;
    type: 'river' | 'lake';
    detailUrl: string;
  }[]
): Promise<ImportResult> {
  await actionAdminRequired();

  // Check which stations already have coordinates in Firestore
  const existingDocs = await firestore
    .collection('pegelstand_stations')
    .get();
  const existingStations = new Map<
    string,
    { lat: number; lng: number; hzbnr?: string }
  >();
  existingDocs.forEach((doc) => {
    const data = doc.data();
    existingStations.set(doc.id, {
      lat: data.lat || 0,
      lng: data.lng || 0,
      hzbnr: data.hzbnr,
    });
  });

  const batch = firestore.batch();
  let withCoordinates = 0;
  let withoutCoordinates = 0;
  let fromDetailPages = 0;

  for (const scraped of scrapedStations) {
    const ref = firestore
      .collection('pegelstand_stations')
      .doc(scraped.slug);
    const existing = existingStations.get(scraped.slug);
    const hasExistingCoords =
      existing && (existing.lat !== 0 || existing.lng !== 0);

    // Station already has coordinates — just update metadata
    if (hasExistingCoords) {
      batch.set(
        ref,
        {
          name: scraped.name,
          type: scraped.type,
          detailUrl: scraped.detailUrl,
        },
        { merge: true }
      );
      withCoordinates++;
      continue;
    }

    // Primary: fetch the station's detail page for exact coordinates + hzbnr
    const detailData = await fetchDetailPageData(scraped.detailUrl);
    if (detailData) {
      batch.set(
        ref,
        {
          name: scraped.name,
          type: scraped.type,
          hzbnr: detailData.hzbnr,
          lat: detailData.lat,
          lng: detailData.lng,
          detailUrl: scraped.detailUrl,
        },
        { merge: true }
      );
      withCoordinates++;
      fromDetailPages++;
      continue;
    }

    // Fallback: try OGC match if detail page had no coordinates
    const ogcMatch = findOgcMatch(scraped.name, ogcStations);
    if (ogcMatch) {
      batch.set(
        ref,
        {
          name: scraped.name,
          type: scraped.type,
          hzbnr: ogcMatch.hzbnr,
          lat: ogcMatch.lat,
          lng: ogcMatch.lng,
          detailUrl: scraped.detailUrl,
        },
        { merge: true }
      );
      withCoordinates++;
      continue;
    }

    // No coordinates available — admin sets them manually later
    batch.set(
      ref,
      {
        name: scraped.name,
        type: scraped.type,
        lat: 0,
        lng: 0,
        detailUrl: scraped.detailUrl,
      },
      { merge: true }
    );
    withoutCoordinates++;
  }

  await batch.commit();

  return {
    total: scrapedStations.length,
    withCoordinates,
    withoutCoordinates,
    fromDetailPages,
  };
}
