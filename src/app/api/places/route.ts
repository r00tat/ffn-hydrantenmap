import { NextRequest, NextResponse } from 'next/server';
import { defaultGeoPosition, GeoPosition } from '../../../common/geo';
import { searchPlace } from '../../../components/actions/maps/places';
import userRequired from '../../../server/auth/userRequired';
import { ApiException } from '../errors';

export async function POST(req: NextRequest) {
  try {
    await userRequired(req);

    const body = await req.json();

    if (!body?.query) {
      throw new ApiException('Missing parameter query', { status: 400 });
    }
    const pos = GeoPosition.fromLatLng([
      body?.position?.lat || defaultGeoPosition.lat,
      body?.position?.lng || defaultGeoPosition.lng,
    ]);
    const places = await searchPlace(body.query, {
      position: pos,
      maxResults: body?.maxResults || 3,
    });
    return NextResponse.json({ places });
  } catch (err: any) {
    console.error(`failed get hydranten`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
