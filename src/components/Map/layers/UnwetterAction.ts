'use server';

import { checkAuth } from '../../../app/auth';
import { defaultGeoPosition } from '../../../common/geo';
import { getSpreadsheetData } from '../../../server/spreadsheet';
import { searchPlace } from '../../actions/maps/places';

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

export async function fetchUnwetterData(
  sheetId: string = process.env.EINSATZMAPPE_SHEET_ID || '',
  range: string = process.env.EINSATZMAPPE_SHEET_RANGE || ''
): Promise<UnwetterData[]> {
  await checkAuth();

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
          start = '',
          done = '',
          info = '',
          latLng = '',
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
          const desc = `${searchString}\n${status}${
            fzg && ' von '
          }${fzg}\n${description}\n${start}${
            done && '-'
          }${done}\n${info}`.trim();
          return {
            id: `${name} ${lat} ${lng}`.trim(),
            street,
            number,
            city: city,
            name,
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
}
