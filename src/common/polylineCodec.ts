import type { LatLngPosition } from './geo';

/**
 * Kodierter Polylinienzug nach dem Google-Verfahren: Zickzack-Varint über
 * Deltas, fünf Bit je Zeichen, Basis 63.
 *
 * Gebraucht wird er für die Ringe des Wasserstandsmodells. Die Hauskonvention
 * `JSON.stringify(LatLngPosition[])` wie bei `positions` wäre hier zu teuer:
 * das Element hängt auf **jedem** Gerät an einem Live-Listener und wird bei
 * jeder Änderung vollständig übertragen. 8.000 Punkte sind kodiert rund 35 KB,
 * als JSON rund 190 KB.
 *
 * Genauigkeit 1e-6 Grad und nicht die üblichen 1e-5: das sind 0,11 m und damit
 * unter der feinsten Rasterweite des Höhenmodells (1 m). Mit 1e-5 lägen die
 * Stützpunkte um bis zu 1,1 m falsch — mehr als die Zelle, aus der sie kommen.
 */

export const POLYLINE_PRECISION = 6;

function encodeSigned(value: number, out: string[]): void {
  let v = value < 0 ? ~(value << 1) : value << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

export function encodePolyline(
  points: LatLngPosition[],
  precision = POLYLINE_PRECISION
): string {
  const factor = 10 ** precision;
  const out: string[] = [];
  let lastLat = 0;
  let lastLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * factor);
    const iLng = Math.round(lng * factor);
    encodeSigned(iLat - lastLat, out);
    encodeSigned(iLng - lastLng, out);
    lastLat = iLat;
    lastLng = iLng;
  }
  return out.join('');
}

export function decodePolyline(
  encoded: string,
  precision = POLYLINE_PRECISION
): LatLngPosition[] {
  const factor = 10 ** precision;
  const points: LatLngPosition[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  /**
   * Ein Wert, oder `undefined` bei abgeschnittener Eingabe.
   *
   * Eine halbe Zahl am Ende ist kein Punkt. Sie stillschweigend als 0 zu lesen
   * hieße, einen Ring mit einem Sprung auf den Nullmeridian zu zeichnen.
   */
  const readSigned = (): number | undefined => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return undefined;
      const byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = readSigned();
    if (dLat === undefined) break;
    const dLng = readSigned();
    if (dLng === undefined) break;
    lat += dLat;
    lng += dLng;
    points.push([lat / factor, lng / factor]);
  }
  return points;
}
