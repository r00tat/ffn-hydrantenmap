import type { LatLngPosition } from '../geo';
import type { AdriaOffsetGrid } from './terrainIndexTypes';

/**
 * Der Zuschlag von EVRF2000 auf müA (Adria), bilinear aus dem amtlichen
 * BEV-Höhen-Grid interpoliert.
 *
 * `Adria = EVRF2000 + offset`. Die Pegelstände der Seen werden in müA geführt;
 * ohne diesen Zuschlag läge eine berechnete Wasserfläche systematisch etwa
 * 0,4 m zu hoch — bei Wassertiefen von 0,3–1 m der Unterschied zwischen
 * „Straße frei" und „Straße unter Wasser".
 *
 * Kein Festwert, weil der Zuschlag über das Burgenland um 13,9 cm schwankt.
 */

const decodeValues = (values: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(values);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(values, 'base64'));
};

export interface AdriaOffsetLookup {
  /** Zuschlag in Metern an dieser Stelle, oder `undefined` außerhalb. */
  offsetAt(position: LatLngPosition): number | undefined;
}

export function adriaOffsetLookup(grid: AdriaOffsetGrid): AdriaOffsetLookup {
  const bytes = decodeValues(grid.values);

  /**
   * Indizes werden an den Rand geklemmt, nicht verworfen.
   *
   * Damit fällt die bilineare Interpolation am Gitterrand sauber auf eine
   * lineare zurück und trifft Gitterpunkte exakt. Ein Mittelwert über die
   * vorhandenen Ecken täte das nicht — er verschiebt selbst einen genau
   * getroffenen Gitterpunkt. Außerhalb des Gitters greift die Prüfung in
   * `offsetAt`, nicht diese Klemmung.
   */
  const at = (col: number, row: number): number => {
    const c = Math.min(Math.max(col, 0), grid.cols - 1);
    const r = Math.min(Math.max(row, 0), grid.rows - 1);
    return (grid.baseMm + bytes[r * grid.cols + c]) / 1000;
  };

  // Eine halbe Zelle Zugabe: das Gitter ist aus der Bounding-Box des Landes
  // abgetastet, ein Punkt am Rand soll nicht ohne Zuschlag dastehen.
  const lonMax = grid.lonMin + (grid.cols - 1) * grid.lonStep;
  const latMax = grid.latMin + (grid.rows - 1) * grid.latStep;

  return {
    offsetAt([lat, lng]) {
      if (
        lng < grid.lonMin - grid.lonStep / 2 ||
        lng > lonMax + grid.lonStep / 2 ||
        lat < grid.latMin - grid.latStep / 2 ||
        lat > latMax + grid.latStep / 2
      ) {
        return undefined;
      }

      const x = (lng - grid.lonMin) / grid.lonStep;
      const y = (lat - grid.latMin) / grid.latStep;
      const col = Math.floor(x);
      const row = Math.floor(y);
      const fx = x - col;
      const fy = y - row;

      const top = at(col, row) + (at(col + 1, row) - at(col, row)) * fx;
      const bottom =
        at(col, row + 1) + (at(col + 1, row + 1) - at(col, row + 1)) * fx;
      return top + (bottom - top) * fy;
    },
  };
}

/** Kodiert einen Zuschlag in Millimetern als `uint8` mit Basis. */
export function encodeAdriaOffsets(
  offsetsMm: number[],
  cols: number,
  rows: number
): Pick<AdriaOffsetGrid, 'baseMm' | 'values' | 'cols' | 'rows'> {
  const baseMm = Math.floor(Math.min(...offsetsMm));
  const span = Math.ceil(Math.max(...offsetsMm)) - baseMm;
  if (span > 255) {
    throw new Error(
      `Adria-Zuschlag umfasst ${span} mm und passt nicht in ein Byte je Zelle`
    );
  }
  const bytes = new Uint8Array(cols * rows);
  offsetsMm.forEach((value, i) => {
    bytes[i] = Math.round(value) - baseMm;
  });
  const values =
    typeof btoa === 'function'
      ? btoa(String.fromCharCode(...bytes))
      : Buffer.from(bytes).toString('base64');
  return { baseMm, values, cols, rows };
}
