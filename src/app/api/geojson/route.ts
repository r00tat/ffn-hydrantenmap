import { NextRequest, NextResponse } from 'next/server';
import tokenRequired from '../../../server/auth/tokenRequired';
import exportGeoJson, {
  createFilterProps,
  GeoFilterProperties,
} from '../../../server/geojson';

export async function POST(req: NextRequest) {
  try {
    await tokenRequired(req);

    const filterProps: GeoFilterProperties = createFilterProps({
      lat: req.nextUrl.searchParams.get('lat') || undefined,
      lng: req.nextUrl.searchParams.get('lng') || undefined,
      radius: req.nextUrl.searchParams.get('radius') || undefined,
      bbox: req.nextUrl.searchParams.get('bbox') || undefined,
    });

    console.info(
      `loading geojson for ${filterProps.center} with radius ${
        filterProps.radius
      } (bbox: ${JSON.stringify(filterProps.bbox)})`
    );
    const featureCollection = await exportGeoJson(
      filterProps.center,
      filterProps.radius,
      filterProps.bbox,
      req.nextUrl.searchParams.get('debug') === 'true'
    );
    return NextResponse.json(featureCollection);
  } catch (err: any) {
    console.error(`geojson failed: ${err}`);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
