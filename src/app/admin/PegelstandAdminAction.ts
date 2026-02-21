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

export async function importOgcStations(
  ogcStations: OgcStation[],
  scrapedSlugs: {
    slug: string;
    name: string;
    type: 'river' | 'lake';
    detailUrl: string;
  }[]
): Promise<number> {
  await actionAdminRequired();

  const batch = firestore.batch();
  let importCount = 0;

  for (const ogcStation of ogcStations) {
    const ogcNameLower = ogcStation.name.toLowerCase();
    const ogcLocationPart = ogcNameLower.split(' (')[0].trim();

    const matched = scrapedSlugs.find((scraped) => {
      const scrapedNameLower = scraped.name.toLowerCase();
      const scrapedLocationPart = scrapedNameLower.split(' / ')[0].trim();

      return (
        scrapedNameLower.includes(ogcNameLower) ||
        ogcNameLower.includes(scrapedNameLower) ||
        scrapedLocationPart === ogcLocationPart
      );
    });

    if (matched) {
      const doc: PegelstandStationDoc = {
        name: matched.name,
        type: matched.type,
        hzbnr: ogcStation.hzbnr,
        lat: ogcStation.lat,
        lng: ogcStation.lng,
        detailUrl: matched.detailUrl,
      };

      const ref = firestore
        .collection('pegelstand_stations')
        .doc(matched.slug);
      batch.set(ref, doc, { merge: true });
      importCount++;
    }
  }

  if (importCount > 0) {
    await batch.commit();
  }

  return importCount;
}
