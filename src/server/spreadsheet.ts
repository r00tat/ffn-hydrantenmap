import 'server-only';

import { Feature, Point } from 'geojson';
import { google, sheets_v4 } from 'googleapis';
import { createWorkspaceAuth } from './auth/workspace';
import {
  geoFilterFactory,
  GeoFilterProperties,
  GeoJsonFeatureColleaction,
  GeoProperties,
} from './geojson';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

interface SpreadsheetGeoObject {
  id: string;
  description: string;
  lat: number;
  lng: number;
  [key: string]: any;
}

export async function getSpreadsheetData(
  spreadsheetId: string,
  range: string,
  options: {
    valueRenderOption?: 'UNFORMATTED_VALUE' | 'FORMATTED_VALUE' | 'FORMULA';
  } = {}
) {
  const auth = createWorkspaceAuth(SCOPES);

  const { valueRenderOption = 'UNFORMATTED_VALUE' } = options;

  const sheets = google.sheets({
    version: 'v4',
    auth,
  });

  const values =
    (
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption,
      })
    ).data.values || [];

  // console.info(`values: ${JSON.stringify(values)}`);

  return values;
}

export async function getSpreadsheetObjects<T = SpreadsheetGeoObject>(
  spreadsheetId: string,
  range: string
) {
  const values = await getSpreadsheetData(spreadsheetId, range);

  if (values.length < 2) {
    // no data propably only headers
    return [];
  }

  const [headers] = values.splice(0, 1);
  // console.info(`headers: ${JSON.stringify(headers)}`);

  const data = values
    .filter((row) => row[0]) // filter if the first value is set
    .map(
      (row) =>
        row.reduce((prev, current, i) => {
          prev[`${headers[i]}`] = current;
          return prev;
        }, {}) as T
    );
  return data;
}

export async function exportSpreadsheetGeoJson(
  spreadsheetId: string,
  range: string,
  filter?: GeoFilterProperties
) {
  const filterFn = geoFilterFactory(filter || {});

  const objekte = (await getSpreadsheetObjects(spreadsheetId, range))
    .filter((o) => o.id)
    .filter(filterFn);

  const collection: GeoJsonFeatureColleaction = {
    type: 'FeatureCollection',
    features: [],
  };

  collection.features.push(
    ...objekte.map((o) => {
      const props = { ...o };
      if (o.icon) {
        try {
          props.icon = JSON.parse(o.icon);
        } catch (err) {}
      }
      if (props[''] !== undefined) {
        delete props[''];
      }
      return {
        type: 'Feature',
        geometry: {
          coordinates: [o.lng, o.lat],
          type: 'Point',
        },
        properties: props,
      } as Feature<Point, GeoProperties>;
    })
  );
  return collection;
}
