import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const fill = req.nextUrl.searchParams.get('fill') || '#0000ff';
  return new NextResponse(
    `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="${fill}">
  <path d="M0 0h24v24H0V0z" fill="none" />
  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.88-2.88 7.19-5 9.88C9.92 16.21 7 11.85 7 9z" />
  <circle cx="12" cy="9" r="2.5" />
</svg>
`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
      },
    }
  );
}
