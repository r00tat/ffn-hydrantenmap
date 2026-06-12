export interface StreckenkilometerPoint {
  strasse: string;
  km: number;
  lat: number;
  lng: number;
}

export interface SimpleBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const MIN_ZOOM_FULL_KM = 13;
export const MIN_ZOOM_ALL = 15;

export function formatKm(km: number): string {
  return km.toFixed(1).replace('.', ',');
}

function isFullKm(km: number): boolean {
  return Number.isInteger(Math.round(km * 10) / 10);
}

export function filterVisiblePoints(
  points: StreckenkilometerPoint[],
  zoom: number,
  bounds: SimpleBounds
): StreckenkilometerPoint[] {
  if (zoom < MIN_ZOOM_FULL_KM) return [];
  const fullKmOnly = zoom < MIN_ZOOM_ALL;
  return points.filter(
    (p) =>
      p.lat >= bounds.south &&
      p.lat <= bounds.north &&
      p.lng >= bounds.west &&
      p.lng <= bounds.east &&
      (!fullKmOnly || isFullKm(p.km))
  );
}
