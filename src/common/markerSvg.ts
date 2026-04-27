import { escapeXml, sanitizeHexColor } from './svg-sanitize';

const DATA_URL_PREFIX = 'data:image/svg+xml;utf8,';

function toDataUrl(svg: string): string {
  return `${DATA_URL_PREFIX}${encodeURIComponent(svg)}`;
}

export function markerIconDataUrl(color: string): string {
  const fill = sanitizeHexColor(color, '#0000ff');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="${fill}"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.88-2.88 7.19-5 9.88C9.92 16.21 7 11.85 7 9z"/><circle cx="12" cy="9" r="5" fill="#ddd"/><circle cx="12" cy="9" r="2.5"/></svg>`;
  return toDataUrl(svg);
}

export interface VehicleIconParams {
  name: string;
  fw: string;
  rotate?: number;
}

export function vehicleIconDataUrl({
  name,
  fw,
  rotate = 0,
}: VehicleIconParams): string {
  const safeName = escapeXml(name);
  const safeFw = escapeXml(fw);
  const r = Number.isFinite(rotate) ? Math.trunc(rotate) % 360 : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="45" height="20" viewBox="0 0 45 20" fill="#ff0000"><rect width="45" height="20" x="0" y="0" style="fill:#ff0000" transform="rotate(${r})"/><circle cx="4" cy="6" r="1.5" fill="blue"/><circle cx="4" cy="14" r="1.5" fill="blue"/><line x1="8" y1="0" x2="8" y2="20" style="stroke:rgb(255,255,255);stroke-width:2" transform="rotate(${r})"/><text x="12" y="9" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="8">${safeName}<tspan x="12" y="17">${safeFw}</tspan></text></svg>`;
  return toDataUrl(svg);
}
