import { NextRequest, NextResponse } from 'next/server';
import tokenRequired from '../../../server/auth/tokenRequired';
import {
  createFilterProps,
  GeoFilterProperties,
} from '../../../server/geojson';
import { exportSpreadsheetGeoJson } from '../../../server/spreadsheet';
import { ApiException } from '../errors';
import { isDynamicServerError } from 'next/dist/client/components/hooks-server-context';

export interface ErrorMessage {
  error: string;
}

export async function GET(req: NextRequest) {
  try {
    await tokenRequired(req);

    if (
      !req.nextUrl.searchParams.get('spreadsheetId') ||
      !req.nextUrl.searchParams.get('range')
    ) {
      throw new ApiException('spreadsheetId and range are required', {
        status: 400,
      });
    }

    const filterProps: GeoFilterProperties = createFilterProps({
      lat: req.nextUrl.searchParams.get('lat') || undefined,
      lng: req.nextUrl.searchParams.get('lng') || undefined,
      radius: req.nextUrl.searchParams.get('radius') || undefined,
      bbox: req.nextUrl.searchParams.get('bbox') || undefined,
    });

    // console.info(`loading geojson for ${pos} with radius ${radius}`);
    const featureCollection = await exportSpreadsheetGeoJson(
      `${req.nextUrl.searchParams.get('spreadsheetId')}`,
      `${req.nextUrl.searchParams.get('range')}`,
      filterProps
    );
    return NextResponse.json(featureCollection);
  } catch (err: any) {
    if (isDynamicServerError(err)) {
      throw err;
    }
    console.error(`failed get hydranten`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
