'use server';

import { auth, checkAuth } from '../../../app/auth';
import { defaultGeoPosition } from '../../../common/geo';
import { getSpreadsheetData } from '../../../server/spreadsheet';
import { searchPlace } from '../../actions/maps/places';
import { unstable_cache } from 'next/cache';

export interface UnwetterData {
  id: string;
  street: string;
  number: string;
  city: string;
  name: string;
  description: string;
  lat?: number;
  lng?: number;
  status?: string;
}

function parseLatLng(text: string) {
  const latStr = text.match(/^\d+\.\d+/)?.[0];
  const lngStr = text.match(/\d+\.\d+$/)?.[0];

  const lat = Number.parseFloat(latStr || '');
  const lng = Number.parseFloat(lngStr || '');

  return [
    (!Number.isNaN(lat) && lat) || undefined,
    (!Number.isNaN(lng) && lng) || undefined,
  ];
}

function parseTime(time: string | number) {
  if (typeof time === 'string') {
    return time;
  }
  const minutes = time * 24 * 60;
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(minutes % 60)
    .toString()
    .padStart(2, '0')}`;
}

const fetchUWD = async (sheetId: string, range: string) => {
  console.info(`fetching unwetter data of ${sheetId} ${range}`);
  const values = await getSpreadsheetData(
    sheetId || process.env.EINSATZMAPPE_SHEET_ID || '',
    range || process.env.EINSATZMAPPE_SHEET_RANGE || ''
  );
  const markers = (
    await Promise.all(
      values.map(
        async ([
          name = '',
          street = '',
          number = '',
          city = 'Neusiedl am See',
          status = '',
          fzg = '',
          description = '',
          alarmTime = '',
          start = '',
          done = '',
          info = '',
          latLng = '',
          title = '',
        ]) => {
          let [lat, lng] = parseLatLng(latLng || '');
          const searchString = `${city} ${street} ${number}`;
          if ((!lat || !lng) && street) {
            const [place] = await searchPlace(searchString, {
              position: defaultGeoPosition,
              maxResults: 3,
            });

            // console.info(`place: ${searchString}: ${JSON.stringify(place)}`);
            if (place) {
              lat = Number.parseFloat(place.lat);
              lng = Number.parseFloat(place.lon);
            }
          }
          const desc =
            `${searchString}\nStatus: ${status} ${fzg}\n${description}\n${
              alarmTime && '\nalarmiert: ' + parseTime(alarmTime)
            }\n${start && 'begonnen: ' + parseTime(start)}${
              done && '\nabgeschlossen: ' + parseTime(done)
            }\n${info}`
              .replace(/\n{2,}/g, '\n')
              .trim();
          return {
            id: `${name} ${lat} ${lng}`.trim(),
            street,
            number,
            city: city,
            name: title,
            description: desc,
            lat,
            lng,
            status,
          } as UnwetterData;
        }
      )
    )
  ).filter(({ lat, lng }) => lat && lng);

  return markers;
};

export const fetchUnwetterCachedData = unstable_cache(
  async (sheetId: string, range: string) => fetchUWD(sheetId, range),
  ['unwetter-sheet-data'],
  { revalidate: 10 }
);

export async function fetchUnwetterData(
  sheetId: string = process.env.EINSATZMAPPE_SHEET_ID || '',
  range: string = process.env.EINSATZMAPPE_SHEET_RANGE || ''
): Promise<UnwetterData[]> {
  const session = await auth();
  if (!session?.user) {
    // unauthorized
    console.warn('unauthorized to access unwetter data');
    return [];
  }

  console.info(
    `requested unwetter data for ${
      sheetId || process.env.EINSATZMAPPE_SHEET_ID
    } ${range}`
  );
  return fetchUnwetterCachedData(
    sheetId || process.env.EINSATZMAPPE_SHEET_ID || '',
    range
  );
}
