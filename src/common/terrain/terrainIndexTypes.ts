import type { LaeaBounds } from './grid';

/**
 * Typen des Kachel-Index `terrain/v1/index.json`.
 *
 * `base`, `step` und `nodataValue` stehen bewusst **im Index und nicht im
 * Code**: ein Wechsel der Höhenpräzision oder der Rasterweite ist damit eine
 * reine Neuerzeugung der Kacheln, ohne Änderung im Client.
 */

export interface TerrainAvailability {
  cols: number;
  rows: number;
  /**
   * base64, MSB-first, durchgehend gepackt (kein Zeilenpadding),
   * Zeilen von `nMin` nach `nMax`.
   */
  bits: string;
}

export type TerrainLevelId = 'detail' | 'overview';

export interface TerrainLevel {
  id: TerrainLevelId;
  /** Kantenlänge einer Zelle in m. */
  resolutionM: number;
  /** Kantenlänge eines Blocks in Pixeln. */
  blockPx: number;
  /** Kantenlänge eines Blocks in m — `resolutionM * blockPx`. */
  blockSizeM: number;
  /** Höhe des kodierten Werts 0 in m. */
  base: number;
  /** Höhenschritt je kodierter Einheit in m. */
  step: number;
  /** Kodierter Wert, der „keine Daten" bedeutet. */
  nodataValue: number;
  /** z.B. `detail/CRS3035RES1000mN{n}E{e}.png` */
  pathTemplate: string;
  bounds: LaeaBounds;
  availability: TerrainAvailability;
}

export interface TerrainSourceInfo {
  name: string;
  /** Stand der Befliegungsdaten, z.B. `20190915`. */
  epoch: string;
  license: string;
  attribution: string;
}

export interface TerrainIndex {
  version: number;
  crs: 'EPSG:3035';
  heightDatum: 'EVRF2000';
  /**
   * Zuschlag auf die Höhen, um müA (Adria) zu erhalten — das System der
   * Pegelstände. Aus der Kalibrierung gegen die Burgenland-Gemeindedaten.
   */
  adriaOffsetM: number;
  adriaOffsetSdM: number;
  adriaOffsetSamples: number;
  source: TerrainSourceInfo;
  produced: string;
  levels: TerrainLevel[];
}

export const terrainLevel = (
  index: TerrainIndex,
  id: TerrainLevelId
): TerrainLevel | undefined => index.levels.find((level) => level.id === id);

/** Von fein nach grob — die Reihenfolge, in der eine Abfrage sucht. */
export const TERRAIN_LEVEL_ORDER: readonly TerrainLevelId[] = [
  'detail',
  'overview',
];
