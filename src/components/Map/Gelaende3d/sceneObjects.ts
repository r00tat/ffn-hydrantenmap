import type { LatLngPosition } from '../../../common/geo';
import {
  groundScale,
  mercatorX,
  mercatorY,
} from '../../../common/terrain/terrainMesh';
import type {
  ContourLine,
  TerrainMesh,
} from '../../../common/terrain/terrainTypes';
import type {
  Connection,
  FirecallItem,
  MultiPointItem,
} from '../../firebase/firestore';
import { getConnectionPositions } from '../../FirecallItems/elements/connection/distance';
import { foerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';
import { LINE_LIFT_M } from './gelaende3d';

/**
 * Einsatzobjekte, Leitungen und Höhenlinien in Szenenkoordinaten.
 *
 * Reine Rechnung, kein Renderer: was hier steht, lässt sich ohne WebGL prüfen —
 * und darunter liegt in `gelaende3dScene.ts` nur noch Verdrahtung.
 */

export interface ScenePoint {
  x: number;
  z: number;
}

export interface SceneProjector {
  toScene(position: LatLngPosition): ScenePoint;
  /** Geländehöhe in m, `undefined` außerhalb des Netzes oder über einem Loch. */
  groundAt(point: ScenePoint): number | undefined;
}

export function sceneProjector(mesh: TerrainMesh): SceneProjector {
  const scale = groundScale(mesh.center[0]);
  const cx = (mesh.merc.xMin + mesh.merc.xMax) / 2;
  const cy = (mesh.merc.yMin + mesh.merc.yMax) / 2;
  const halfWidth = mesh.widthM / 2;
  const halfDepth = mesh.depthM / 2;

  return {
    toScene([lat, lng]) {
      return {
        x: (mercatorX(lng) - cx) * scale,
        z: (cy - mercatorY(lat)) * scale,
      };
    },

    groundAt({ x, z }) {
      // Bilinear aus denselben Vertices, aus denen die Fläche gezeichnet wird —
      // sonst schwebt eine Marke sichtbar über oder unter ihrem Gelände.
      const fc = ((x + halfWidth) / mesh.widthM) * (mesh.cols - 1);
      const fr = ((z + halfDepth) / mesh.depthM) * (mesh.rows - 1);
      const c0 = Math.floor(fc);
      const r0 = Math.floor(fr);
      if (c0 < 0 || r0 < 0 || c0 + 1 >= mesh.cols || r0 + 1 >= mesh.rows) {
        return undefined;
      }
      const tc = fc - c0;
      const tr = fr - r0;
      const at = (r: number, c: number): number | undefined => {
        const i = r * mesh.cols + c;
        return mesh.holes[i] ? undefined : mesh.positions[i * 3 + 1];
      };
      const v00 = at(r0, c0);
      const v01 = at(r0, c0 + 1);
      const v10 = at(r0 + 1, c0);
      const v11 = at(r0 + 1, c0 + 1);
      if (
        v00 === undefined ||
        v01 === undefined ||
        v10 === undefined ||
        v11 === undefined
      ) {
        return undefined;
      }
      return (
        v00 * (1 - tc) * (1 - tr) +
        v01 * tc * (1 - tr) +
        v10 * (1 - tc) * tr +
        v11 * tc * tr
      );
    },
  };
}

/** Name und Symbol eines Einsatzobjekts. */
export interface MarkerLook {
  name: string;
  iconUrl: string;
}

/**
 * Woher Name und Symbol kommen.
 *
 * Hereingereicht statt hier aufgelöst: das Elementregister
 * (`FirecallItems/elements`) zieht den ganzen Komponentenbaum samt Firestore
 * und Storage mit sich. Dieses Modul soll ohne all das prüfbar bleiben — und
 * der Dialog, der es aufruft, lebt ohnehin in dieser Welt.
 */
export type MarkerLookup = (item: FirecallItem) => MarkerLook;

export interface MarkerPlacement {
  id: string;
  name: string;
  iconUrl: string;
  x: number;
  z: number;
  /** Geländehöhe in m, ohne Überhöhung und ohne den Versatz nach oben. */
  groundM: number;
}

/**
 * Die Marken der Einsatzobjekte.
 *
 * Übergangen wird, was keine eigene Position hat (Linien und Flächen — die
 * kommen als Zug) und was außerhalb des Ausschnitts oder über einem Loch liegt.
 * Eine Marke ohne Geländehöhe hätte keinen ablesbaren Standort.
 */
export function markerPlacements(
  items: FirecallItem[],
  projector: SceneProjector,
  look: MarkerLookup
): MarkerPlacement[] {
  const out: MarkerPlacement[] = [];
  for (const item of items) {
    if (item.lat === undefined || item.lng === undefined) continue;
    const point = projector.toScene([item.lat, item.lng]);
    const groundM = projector.groundAt(point);
    if (groundM === undefined) continue;
    const { name, iconUrl } = look(item);
    out.push({
      id: item.id ?? `${item.lat},${item.lng}`,
      name,
      iconUrl,
      x: point.x,
      z: point.z,
      groundM,
    });
  }
  return out;
}

export interface PumpPlacement {
  x: number;
  z: number;
  groundM: number;
  /** Ausgangsdruck in bar — Beschriftung übernimmt die Karte, nicht die Szene. */
  ausgangsdruck: number;
}

/**
 * Die Pumpenstandorte der Löschwasserförderung.
 *
 * Sie stehen **nicht** am Element, sondern fallen in der Förderrechnung an
 * (`foerderungView`). Aus dem Item gelesen wären sie ein zweiter, veralteter
 * Stand derselben Größe.
 */
export function pumpPlacements(
  items: FirecallItem[],
  projector: SceneProjector
): PumpPlacement[] {
  const out: PumpPlacement[] = [];
  for (const item of items) {
    if (item.type !== 'connection') continue;
    const view = foerderungView(item as Connection);
    if (!view) continue;
    for (const pump of view.pumps) {
      const point = projector.toScene(pump.position);
      const groundM = projector.groundAt(point);
      if (groundM === undefined) continue;
      out.push({
        x: point.x,
        z: point.z,
        groundM,
        ausgangsdruck: pump.ausgangsdruck,
      });
    }
  }
  return out;
}

/**
 * Ein Zug auf der Geländehaut.
 *
 * Zwischen den Stützpunkten wird nicht nachverdichtet: die Punkte einer Leitung
 * liegen nach dem Straßenrouting dicht genug, und ein nachträglich eingefügter
 * Punkt hätte eine Höhe, die niemand geprüft hat. Punkte ohne Geländehöhe
 * entfallen.
 */
export function scenePath(
  positions: LatLngPosition[],
  projector: SceneProjector,
  liftM: number = LINE_LIFT_M
): Float32Array {
  const flat: number[] = [];
  for (const position of positions) {
    const point = projector.toScene(position);
    const groundM = projector.groundAt(point);
    if (groundM === undefined) continue;
    flat.push(point.x, groundM + liftM, point.z);
  }
  return Float32Array.from(flat);
}

/** Die Züge aller Leitungen und Linien im Einsatz. */
export function connectionPaths(
  items: FirecallItem[],
  projector: SceneProjector
): Float32Array[] {
  return items
    .filter((item) => item.type === 'connection' || item.type === 'line')
    .map((item) =>
      scenePath(getConnectionPositions(item as MultiPointItem), projector)
    )
    .filter((path) => path.length >= 6);
}

/**
 * Höhenlinien auf der Geländehaut.
 *
 * Die Höhe kommt aus der Linie selbst, nicht aus dem Netz: die Linie ist auf
 * dem feinen Mosaik gerechnet, das Netz auf höchstens 256 Stützstellen. Aus dem
 * Netz genommen läge sie sichtbar neben ihrer eigenen Höhe.
 */
export function contourPaths(
  lines: ContourLine[],
  projector: SceneProjector,
  liftM: number = LINE_LIFT_M
): { heightM: number; points: Float32Array }[] {
  return lines
    .map((line) => {
      const flat: number[] = [];
      for (const position of line.points) {
        const point = projector.toScene(position);
        flat.push(point.x, line.heightM + liftM, point.z);
      }
      return { heightM: line.heightM, points: Float32Array.from(flat) };
    })
    .filter((line) => line.points.length >= 6);
}
