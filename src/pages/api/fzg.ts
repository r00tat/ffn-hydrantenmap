// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>
) {
  const { name = '', fw = '' } = req.query;
  res.setHeader(`Content-Type`, 'image/svg+xml').send(`
  <svg xmlns="http://www.w3.org/2000/svg" width="45px" height="20" fill="#ff0000">
  <rect width="45" height="20" x="0" y="0" style="fill:#ff0000"></rect>
  <circle cx="4" cy="6" r="1.5" fill="blue" />
  <circle cx="4" cy="14" r="1.5" fill="blue" />
  <line x1="8" y1="0" x2="8" y2="20" style="stroke:rgb(255,255,255);stroke-width:2" />
  <text x="12" y="9" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="8">
    ${name}
    <tspan x="12" y="17">${fw}</tspan>
  </text>
</svg>
`);
}
