import bboxPolygon from '@turf/bbox-polygon';
import { lineString } from '@turf/helpers';
import { Feature, Point } from 'geojson';
import { google } from 'googleapis';
import {
  geoFilterFactory,
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

export async function getSpreadsheetData(spreadsheetId: string, range: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
  });

  // const auth = new google.auth.JWT({
  //   email: this.config.serviceAccount.client_email,
  //   key: this.config.serviceAccount.private_key,
  //   keyId: this.config.serviceAccount.private_key_id,
  //   scopes: SCOPES,
  //   // subject: this.user,
  // });

  const sheets = google.sheets({
    version: 'v4',
    auth,
  });

  const values =
    (
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'UNFORMATTED_VALUE',
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
  filter?: {
    bbox?: GeoJSON.BBox;
    center?: GeoJSON.Position;
    range?: number;
  }
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
