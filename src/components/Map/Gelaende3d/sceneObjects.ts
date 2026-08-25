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
import {
  WASSERSTAND_DEFAULTS,
  wasserstandFlaeche,
  wasserstandLevelM,
} from '../../../common/terrain/wasserstand';
import type {
  Connection,
  FirecallItem,
  MultiPointItem,
  Wasserstand,
} from '../../firebase/firestore';
import { contourLabelText, isIndexContour } from '../layers/hoehenlinien';
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
  /** Halbe Kantenlängen der Szene — der Rahmen, auf den zugeschnitten wird. */
  extent: { halfWidthM: number; halfDepthM: number };
}

export function sceneProjector(mesh: TerrainMesh): SceneProjector {
  const scale = groundScale(mesh.center[0]);
  const cx = (mesh.merc.xMin + mesh.merc.xMax) / 2;
  const cy = (mesh.merc.yMin + mesh.merc.yMax) / 2;
  const halfWidth = mesh.widthM / 2;
  const halfDepth = mesh.depthM / 2;

  return {
    extent: { halfWidthM: halfWidth, halfDepthM: halfDepth },

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

/** Ein Polygon mit seinen Löchern, beides in Szenenkoordinaten. */
export interface WaterPolygon {
  outer: ScenePoint[];
  holes: ScenePoint[][];
}

export interface WaterSurface {
  /** Wasserspiegel in m (EVRF2000) — dieselbe Skala wie die Höhen im Netz. */
  levelM: number;
  color: string;
  /** Deckkraft 0..1. */
  opacity: number;
  polygons: WaterPolygon[];
}

/**
 * Einen Ring an einer achsparallelen Halbebene abschneiden (Sutherland-Hodgman).
 *
 * Der Rahmen ist konvex, deshalb reichen vier solche Schnitte nacheinander.
 */
const clipHalfPlane = (
  ring: ScenePoint[],
  inside: (point: ScenePoint) => boolean,
  cut: (a: ScenePoint, b: ScenePoint) => ScenePoint
): ScenePoint[] => {
  const out: ScenePoint[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const previous = ring[(i + ring.length - 1) % ring.length];
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn) {
      if (!previousIn) out.push(cut(previous, current));
      out.push(current);
    } else if (previousIn) {
      out.push(cut(previous, current));
    }
  }
  return out;
};

/**
 * Einen Ring auf den Ausschnitt zuschneiden.
 *
 * Eine Flutfläche endet nicht am Kartenrand — sie ist über einen Umkreis
 * gerechnet, der weit über den Ausschnitt hinausgehen kann. Ungeschnitten
 * spannte sie die Szene auf, ohne dass dabei mehr zu sehen wäre: das Gelände
 * hört am Rand des Netzes auf, das Wasser liefe ins Leere weiter, und der Blick
 * zöge sich auf einen blauen Fleck zurück.
 */
export function clipRingToExtent(
  ring: ScenePoint[],
  halfWidthM: number,
  halfDepthM: number
): ScenePoint[] {
  const lerp = (a: ScenePoint, b: ScenePoint, t: number): ScenePoint => ({
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  });
  let out = ring;
  const edges: [
    (point: ScenePoint) => boolean,
    (a: ScenePoint, b: ScenePoint) => ScenePoint,
  ][] = [
    [
      (p) => p.x >= -halfWidthM,
      (a, b) => lerp(a, b, (-halfWidthM - a.x) / (b.x - a.x)),
    ],
    [
      (p) => p.x <= halfWidthM,
      (a, b) => lerp(a, b, (halfWidthM - a.x) / (b.x - a.x)),
    ],
    [
      (p) => p.z >= -halfDepthM,
      (a, b) => lerp(a, b, (-halfDepthM - a.z) / (b.z - a.z)),
    ],
    [
      (p) => p.z <= halfDepthM,
      (a, b) => lerp(a, b, (halfDepthM - a.z) / (b.z - a.z)),
    ],
  ];
  for (const [inside, cut] of edges) {
    if (!out.length) return [];
    out = clipHalfPlane(out, inside, cut);
  }
  return out;
}

/** Fläche eines Rings, Betrag. Nur zum Vergleich, nicht zum Anzeigen. */
const ringArea = (ring: ScenePoint[]): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
};

/** Punkt im Ring, Strahlenverfahren. */
const pointInRing = (point: ScenePoint, ring: ScenePoint[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};

/**
 * Ringe in Umrisse und Löcher aufteilen.
 *
 * **Even-odd**, dieselbe Regel, mit der die Karte die Fläche füllt: ein Ring in
 * ungerader Verschachtelungstiefe ist ein Loch. Eine andere Regel hier hieße,
 * dass die überflutete Fläche in 3D eine andere wäre als in der Karte — und
 * eine Insel im Hochwasser ist genau die Stelle, auf die man schaut.
 */
export function ringPolygons(rings: ScenePoint[][]): WaterPolygon[] {
  const usable = rings.filter((ring) => ring.length >= 3);
  const depth = usable.map((ring, index) =>
    usable.reduce(
      (count, other, otherIndex) =>
        otherIndex !== index && pointInRing(ring[0], other) ? count + 1 : count,
      0
    )
  );

  const polygons: WaterPolygon[] = [];
  const outerIndex = new Map<number, number>();
  usable.forEach((ring, index) => {
    if (depth[index] % 2 !== 0) return;
    outerIndex.set(index, polygons.length);
    polygons.push({ outer: ring, holes: [] });
  });

  usable.forEach((ring, index) => {
    if (depth[index] % 2 === 0) return;
    // Der kleinste umschließende Umriss ist der, zu dem das Loch gehört.
    let best: number | undefined;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const [candidate, slot] of outerIndex) {
      if (!pointInRing(ring[0], usable[candidate])) continue;
      const area = ringArea(usable[candidate]);
      if (area < bestArea) {
        bestArea = area;
        best = slot;
      }
    }
    if (best !== undefined) polygons[best].holes.push(ring);
  });

  return polygons;
}

/**
 * Die überfluteten Flächen als waagrechte Wasserspiegel.
 *
 * In 3D ist die Fläche keine eingefärbte Zone, sondern **eine Ebene auf der
 * Höhe des Wasserstands**: das Gelände ragt daraus hervor oder eben nicht, und
 * genau das ist die Frage, die im Hochwasserfall gestellt wird. Die Tiefenbänder
 * der Karte werden dafür nicht gebraucht — die Tiefe steht bereits zwischen dem
 * Spiegel und dem Gelände darunter.
 *
 * Übergangen wird, was nicht gerechnet ist: ohne Basishöhe gibt es keinen
 * Spiegel, und eine Fläche ohne Höhe wäre eine Behauptung.
 */
export function waterSurfaces(
  items: FirecallItem[],
  projector: SceneProjector
): WaterSurface[] {
  const out: WaterSurface[] = [];
  for (const item of items) {
    if (item.type !== 'wasserstand') continue;
    const wasserstand = item as Wasserstand;
    const levelM = wasserstandLevelM(wasserstand);
    if (levelM === undefined) continue;
    const { halfWidthM, halfDepthM } = projector.extent;
    const rings = wasserstandFlaeche(wasserstand)
      .map((ring) =>
        clipRingToExtent(
          ring.map((position) => projector.toScene(position)),
          halfWidthM,
          halfDepthM
        )
      )
      .filter((ring) => ring.length >= 3);
    const polygons = ringPolygons(rings);
    if (!polygons.length) continue;
    out.push({
      levelM,
      color: wasserstand.color ?? WASSERSTAND_DEFAULTS.farbe,
      opacity: (wasserstand.opacity ?? WASSERSTAND_DEFAULTS.deckkraft) / 100,
      polygons,
    });
  }
  return out;
}

export interface SceneLabel {
  text: string;
  /** Höhe in m, ohne Überhöhung — die Szene setzt sie um. */
  heightM: number;
  x: number;
  z: number;
}

/**
 * Wie viele Höhenlinien höchstens beschriftet werden.
 *
 * Ein flacher Ausschnitt bei 0,5 m Äquidistanz hat über tausend Linienstücke.
 * Jedes beschriftet wäre eine Wand aus Zahlen, durch die kein Gelände mehr zu
 * sehen ist.
 */
export const MAX_CONTOUR_LABELS = 60;

/**
 * Die Höhenangaben an den Höhenlinien.
 *
 * Nur an den **Zähllinien**, dieselbe Auswahl wie in der Karte
 * (`isIndexContour`): dazwischen stünde bei kleiner Äquidistanz ein Bündel
 * Zahlen, in dem keine mehr zu lesen ist. Ohne die Angabe ist eine Höhenlinie
 * nur ein Strich — man sieht, dass es steiler wird, aber nicht, worauf.
 */
export function contourLabels(
  lines: ContourLine[],
  projector: SceneProjector,
  equidistanceM: number,
  maxLabels: number = MAX_CONTOUR_LABELS
): SceneLabel[] {
  const candidates: SceneLabel[] = [];
  for (const line of lines) {
    if (!isIndexContour(line.heightM, equidistanceM)) continue;
    if (line.points.length < 2) continue;
    // Die Mitte des Zuges: an den Enden läuft die Linie oft aus dem Bild.
    const middle = line.points[Math.floor(line.points.length / 2)];
    const point = projector.toScene(middle);
    candidates.push({
      text: contourLabelText(line.heightM),
      heightM: line.heightM,
      x: point.x,
      z: point.z,
    });
  }

  if (candidates.length <= maxLabels) return candidates;
  // Gleichmäßig ausdünnen statt vorne abschneiden: sonst wäre die eine
  // Bildhälfte beschriftet und die andere nicht.
  const step = candidates.length / maxLabels;
  return Array.from({ length: maxLabels }, (_, index) =>
    candidates[Math.floor(index * step)]
  );
}
