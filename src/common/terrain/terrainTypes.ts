import type { LatLngPosition } from '../geo';
import type { FloodBand } from './floodBands';
import type { FloodReason } from './floodFill';
import type { TerrainLevelId } from './terrainIndexTypes';

/**
 * Die Typen, über die Karte und Worker reden.
 *
 * Getrennt von `terrainIndexTypes.ts`: dort steht, was das Höhenmodell
 * *ausliefert*, hier, was der Client davon *fragt*. Der Worker importiert
 * beides, die Kartenkomponenten nur diese Datei.
 */

export interface TerrainSample {
  /**
   * Höhe im Höhensystem des Index (EVRF2000), **nicht** in müA.
   *
   * Die Umrechnung auf Gebrauchshöhen bleibt bewusst außen: sie gilt nur
   * dort, wo mit Pegelständen verglichen wird. Ein Höhenprofil und eine
   * Höhenlinie brauchen sie nicht, und ein stillschweigend zugeschlagener
   * halber Meter wäre in einem Profil nicht zu erkennen.
   */
  heightM: number;
  /** Welche Stufe geantwortet hat — für die Anzeige der Genauigkeit. */
  level: TerrainLevelId;
}

export interface ContourLine {
  heightM: number;
  /** Bereits nach WGS84 umgerechnet, damit Leaflet sie direkt zeichnet. */
  points: LatLngPosition[];
  /** Geschlossener Ring (Kuppe oder Senke) statt offener Zug. */
  closed: boolean;
}

/**
 * Das Ergebnis einer Höhenlinien-Abfrage.
 *
 * Stufe und Rasterweite gehören dazu, nicht nur die Linien: die Legende muss
 * sagen können, ob 1 m oder 10 m Raster dahintersteht. Ohne die Angabe sieht
 * eine Linie aus der Übersichtsstufe genauso genau aus wie eine aus der
 * Detailstufe.
 */
export interface ContourResult {
  lines: ContourLine[];
  /** `undefined`, wenn keine Stufe geantwortet hat. */
  level?: TerrainLevelId;
  resolutionM?: number;
  /**
   * Tiefste und höchste Höhe im Ausschnitt, nicht die der Linien.
   *
   * Darauf dehnt die Karte ihre Farbrampe, und damit beschriftet die Legende
   * deren Enden. Die Spanne ist weiter als die Linien: die tiefste Linie liegt
   * über dem tiefsten Punkt, die höchste unter dem höchsten.
   */
  minM?: number;
  maxM?: number;
}

/**
 * Was ein Flutlauf zurückgibt.
 *
 * Bewusst **ohne** Raster: die Bänder sind das Ergebnis, gespeichert wird es am
 * Element. Ein Raster über die Thread-Grenze wären Megabyte, und im nächsten
 * Moment bräuchte es sie niemand mehr.
 */
export interface FloodSummary {
  levelId: TerrainLevelId;
  resolutionM: number;
  baender: FloodBand[];
  toleranzM: number;
  inselnVerworfen: number;
  punkte: number;
  cells: number;
  areaM2: number;
  maxDepthM: number;
  longestAxisM: number;
  truncated: 'none' | 'budget';
  missingBlocks: number;
  edgeBlocks: number;
  reason?: FloodReason;
}

export interface FloodProgress {
  /** `fill` ist die Füllung, `bands` das Herausziehen der Ringe. */
  phase: 'fill' | 'bands';
  blocks: number;
  cells: number;
  /** Zahl der Blöcke insgesamt — nur in der Phase `bands` bekannt. */
  total?: number;
}

export interface TerrainBoundsLatLng {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type TerrainRequest =
  | { id: number; op: 'sample'; positions: LatLngPosition[] }
  | {
      id: number;
      op: 'contours';
      bounds: TerrainBoundsLatLng;
      equidistanceM: number;
    }
  | {
      id: number;
      op: 'prefetch';
      level: TerrainLevelId;
      blockIds: string[];
    }
  /**
   * Die vorhandenen Blöcke einer Stufe.
   *
   * Beantwortet der Worker, nicht der Hauptthread: er hält den Index, und eine
   * zweite Stelle, die `index.json` liest, wäre eine zweite Stelle, die von
   * einer neuen Version überrascht wird.
   */
  | { id: number; op: 'blocks'; level: TerrainLevelId }
  | {
      id: number;
      op: 'flood';
      seed: LatLngPosition;
      /** Wasserstand in EVRF2000 — dieselbe Skala wie `TerrainSample.heightM`. */
      heightM: number;
      level: TerrainLevelId;
    }
  /**
   * Abbruch eines laufenden Flutlaufs.
   *
   * Eigene Nachricht und kein Flag an der Anfrage: der Worker steckt zu dem
   * Zeitpunkt in `await` auf eine Kachel, und nur eine neue Nachricht kommt
   * dort noch an.
   */
  | { id: number; op: 'floodAbort'; target: number }
  /**
   * Der Zuschlag EVRF2000 → müA an einer Stelle.
   *
   * Beantwortet der Worker, weil er den Index hält. `sample` liefert
   * absichtlich EVRF2000; die Umrechnung gehört genau dorthin, wo mit
   * Pegelständen verglichen wird — und das ist die Anzeige.
   */
  | { id: number; op: 'adria'; positions: LatLngPosition[] };

export type TerrainResponse =
  | { id: number; ok: true; op: 'sample'; samples: (TerrainSample | null)[] }
  | ({ id: number; ok: true; op: 'contours' } & ContourResult)
  | { id: number; ok: true; op: 'prefetch'; loaded: number; failed: number }
  | { id: number; ok: true; op: 'blocks'; blockIds: string[] }
  | { id: number; ok: true; op: 'flood'; result: FloodSummary }
  | ({ id: number; ok: true; op: 'floodProgress' } & FloodProgress)
  | { id: number; ok: true; op: 'floodAbort' }
  | { id: number; ok: true; op: 'adria'; offsets: (number | null)[] }
  | { id: number; ok: false; error: string };
