import type { LatLngPosition } from '../geo';
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
    };

export type TerrainResponse =
  | { id: number; ok: true; op: 'sample'; samples: (TerrainSample | null)[] }
  | { id: number; ok: true; op: 'contours'; lines: ContourLine[] }
  | { id: number; ok: true; op: 'prefetch'; loaded: number; failed: number }
  | { id: number; ok: false; error: string };
