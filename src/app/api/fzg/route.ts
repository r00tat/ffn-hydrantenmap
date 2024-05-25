import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const name = searchParams.get('name') || '';
  const rotate = searchParams.get('rotate') || '0';
  const rotateInt = !Number.isNaN(Number.parseInt('' + rotate, 10))
    ? Number.parseInt('' + rotate, 10) % 360
    : 0;
  const fw = searchParams.get('fw');
  return new NextResponse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="45px" height="20" fill="#ff0000">
  <rect width="45" height="20" x="0" y="0" style="fill:#ff0000" transform="rotate(${rotateInt})"></rect>
  <circle cx="4" cy="6" r="1.5" fill="blue" />
  <circle cx="4" cy="14" r="1.5" fill="blue" />
  <line x1="8" y1="0" x2="8" y2="20" style="stroke:rgb(255,255,255);stroke-width:2" transform="rotate(${rotateInt})" />
  <text x="12" y="9" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="8">
    ${name}
    <tspan x="12" y="17">${fw}</tspan>
  </text>
</svg>
`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
      },
    }
  );
}
