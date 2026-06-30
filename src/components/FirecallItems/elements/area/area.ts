import { LatLngPosition } from '../../../../common/geo';

/** WGS84 equatorial earth radius in meters (same value @turf/area uses). */
const EARTH_RADIUS = 6378137;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Calculate the geodesic area of a polygon described by lat/lng positions.
 *
 * Uses the spherical ring-area formula (identical approach to @turf/area /
 * OpenLayers `getArea`). The ring is treated as implicitly closed, so the
 * first and last point do not need to be equal. Winding order does not
 * matter — the absolute area is returned.
 *
 * @param positions polygon vertices as `[lat, lng]` pairs
 * @returns area in square meters (0 for fewer than 3 vertices)
 */
export const calculateArea = (positions: LatLngPosition[]): number => {
  if (!positions || positions.length < 3) {
    return 0;
  }

  let total = 0;
  const len = positions.length;
  for (let i = 0; i < len; i++) {
    const [lat1, lng1] = positions[i];
    const [lat2, lng2] = positions[(i + 1) % len];
    total +=
      toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  total = (total * EARTH_RADIUS * EARTH_RADIUS) / 2;
  return Math.abs(total);
};

/** Round to at most `digits` decimals and drop trailing zeros. */
const round = (value: number, digits: number): number =>
  Number(value.toFixed(digits));

/**
 * Format an area (in square meters) into a human readable string, switching to
 * larger units for bigger areas: m² (< 1 ha), ha (< 1 km²), km² (≥ 1 km²).
 */
export const formatArea = (area: number): string => {
  if (area >= 1_000_000) {
    return `${round(area / 1_000_000, 2)} km²`;
  }
  if (area >= 10_000) {
    return `${round(area / 10_000, 2)} ha`;
  }
  return `${Math.round(area)} m²`;
};
