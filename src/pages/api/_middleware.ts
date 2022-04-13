// eslint-disable-next-line @next/next/no-server-import-in-page
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  let res = NextResponse.next();

  if (req.method == 'OPTIONS') {
    res = NextResponse.json({});
    res.headers.set(
      'Access-Control-Allow-Methods',
      'PUT, POST, PATCH, DELETE, GET'
    );
  }

  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  return res;
}
