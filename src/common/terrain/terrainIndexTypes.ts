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

/**
 * Der Zuschlag, der EVRF2000-Höhen in müA (Adria) überführt — das System, in
 * dem die Pegelstände geführt werden.
 *
 * **Ein Festwert genügt nicht.** Über das Burgenland schwankt der Zuschlag
 * zwischen 0,337 m und 0,487 m, also um 15 cm, mit einem systematischen
 * Nord-Süd-Trend von 8 cm. Bei Wassertiefen von 0,3–1 m wäre das ein
 * erheblicher Anteil.
 *
 * Die Werte stammen aus dem amtlichen BEV-Höhen-Grid (EPSG:9275, „GHA height
 * to EVRF2000 Austria height"), nicht aus einer eigenen Regression, und sind
 * auf ein grobes Gitter neu abgetastet: das Feld ist mit etwa 1 mm je
 * Kilometer so glatt, dass 5 km Abstand unter einem Millimeter kosten.
 *
 * `Adria = EVRF2000 + offset`.
 */
export interface AdriaOffsetGrid {
  /** Südwestliche Ecke des Gitters in Grad (WGS84). */
  latMin: number;
  lonMin: number;
  latStep: number;
  lonStep: number;
  cols: number;
  rows: number;
  /**
   * Zuschlag in Millimetern, `uint8` mit Basis: `offsetMm = baseMm + wert`.
   * Zeilen von Süd nach Nord, base64.
   */
  baseMm: number;
  values: string;
  /** Kennwerte zur Anzeige und Plausibilitätsprüfung. */
  meanM: number;
  minM: number;
  maxM: number;
  sourcePoints: number;
}

export interface TerrainIndex {
  version: number;
  crs: 'EPSG:3035';
  heightDatum: 'EVRF2000';
  adriaOffset: AdriaOffsetGrid;
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
