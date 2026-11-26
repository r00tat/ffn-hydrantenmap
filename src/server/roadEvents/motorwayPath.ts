/**
 * Verlauf einer Verkehrsmeldung entlang der Autobahn bzw. Schnellstraße.
 *
 * Die ASFINAG verweist auf GIP-Links im alten Nummernschema, der aktuelle
 * GIP-OGD-Export (GIP 2.0) hat neue IDs. Deshalb werden Anfang und Ende der
 * Meldung auf ein gerichtetes Netz nur aus A- und S-Links gesetzt und der
 * kürzeste Weg darin gesucht. Weil das Netz keine anderen Straßen kennt, kann
 * der Weg eine Sperre nicht umfahren (anders als ein Routing-Dienst).
 * Siehe docs/verkehrsmeldungen.md.
 */
import { LatLng } from '../../common/roadEvents';

/** 2 = beide Richtungen, 1 = nur in Digitalisierungsrichtung, 0 = nur dagegen. */
export type LinkDirection = 0 | 1 | 2;

/** Link als `[vonKnoten, nachKnoten, richtung, koordinaten]`. */
export type EncodedLink = [number, number, LinkDirection, number[]];

export interface MotorwayNetworkFile {
  source: string;
  generated: string;
  links: EncodedLink[];
}

const COORD_SCALE = 1e6;

/** `[lat, lng]`-Folge als Differenzen ganzzahliger Mikrograd. */
export function encodeCoordinates(coords: LatLng[]): number[] {
  const out: number[] = [];
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of coords) {
    const iLat = Math.round(lat * COORD_SCALE);
    const iLng = Math.round(lng * COORD_SCALE);
    out.push(iLat - prevLat, iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

function decodeCoordinates(encoded: number[]): LatLng[] {
  const coords: LatLng[] = [];
  let lat = 0;
  let lng = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    lat += encoded[i];
    lng += encoded[i + 1];
    coords.push([lat / COORD_SCALE, lng / COORD_SCALE]);
  }
  return coords;
}

interface GraphLink {
  from: number;
  to: number;
  forward: boolean;
  backward: boolean;
  coords: LatLng[];
  /** Laufende Länge je Stützpunkt in Metern. */
  offsets: number[];
  length: number;
}

interface Edge {
  link: number;
  /** Ziel-Knoten beim Befahren. */
  target: number;
  reverse: boolean;
}

export interface MotorwayGraph {
  links: GraphLink[];
  edges: Map<number, Edge[]>;
  grid: Map<string, number[]>;
}

const GRID_SIZE = 0.01;
const EARTH_RADIUS = 6371000;

function metersBetween(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLng = (b[1] - a[1]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

function gridKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_SIZE)}:${Math.floor(lng / GRID_SIZE)}`;
}

export function buildMotorwayGraph(file: MotorwayNetworkFile): MotorwayGraph {
  const links: GraphLink[] = [];
  const edges = new Map<number, Edge[]>();
  const grid = new Map<string, number[]>();

  const addEdge = (node: number, edge: Edge) => {
    const list = edges.get(node);
    if (list) list.push(edge);
    else edges.set(node, [edge]);
  };

  for (const [from, to, direction, encoded] of file.links) {
    const coords = decodeCoordinates(encoded);
    if (coords.length < 2) continue;
    const offsets = [0];
    for (let i = 1; i < coords.length; i++) {
      offsets.push(offsets[i - 1] + metersBetween(coords[i - 1], coords[i]));
    }
    const index = links.length;
    const link: GraphLink = {
      from,
      to,
      forward: direction !== 0,
      backward: direction !== 1,
      coords,
      offsets,
      length: offsets[offsets.length - 1],
    };
    links.push(link);
    if (link.forward) addEdge(from, { link: index, target: to, reverse: false });
    if (link.backward) addEdge(to, { link: index, target: from, reverse: true });

    const cells = new Set<string>();
    for (let i = 0; i < coords.length; i++) {
      cells.add(gridKey(coords[i][0], coords[i][1]));
      if (i > 0) {
        // Mittelpunkt, damit lange Segmente keine Zelle überspringen
        cells.add(
          gridKey(
            (coords[i][0] + coords[i - 1][0]) / 2,
            (coords[i][1] + coords[i - 1][1]) / 2
          )
        );
      }
    }
    for (const cell of cells) {
      const list = grid.get(cell);
      if (list) list.push(index);
      else grid.set(cell, [index]);
    }
  }

  return { links, edges, grid };
}

interface Snap {
  link: number;
  /** Position entlang des Links in Metern. */
  offset: number;
  distance: number;
}

function projectOnLink(link: GraphLink, point: LatLng): Snap & { link: -1 } {
  const cosLat = Math.cos((point[0] * Math.PI) / 180);
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS;
  const mPerDegLng = mPerDegLat * cosLat;
  let best = { link: -1 as const, offset: 0, distance: Infinity };
  for (let i = 1; i < link.coords.length; i++) {
    const [aLat, aLng] = link.coords[i - 1];
    const [bLat, bLng] = link.coords[i];
    const ax = (aLng - point[1]) * mPerDegLng;
    const ay = (aLat - point[0]) * mPerDegLat;
    const dx = (bLng - aLng) * mPerDegLng;
    const dy = (bLat - aLat) * mPerDegLat;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lenSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distance = Math.sqrt(px * px + py * py);
    if (distance < best.distance) {
      const segment = link.offsets[i] - link.offsets[i - 1];
      best = { link: -1, offset: link.offsets[i - 1] + t * segment, distance };
    }
  }
  return best;
}

function snapCandidates(
  graph: MotorwayGraph,
  point: LatLng,
  radius: number,
  limit: number
): Snap[] {
  const linkIds = new Set<number>();
  const row = Math.floor(point[0] / GRID_SIZE);
  const col = Math.floor(point[1] / GRID_SIZE);
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      for (const id of graph.grid.get(`${r}:${c}`) ?? []) linkIds.add(id);
    }
  }
  const snaps: Snap[] = [];
  for (const id of linkIds) {
    const projected = projectOnLink(graph.links[id], point);
    if (projected.distance <= radius) {
      snaps.push({ link: id, offset: projected.offset, distance: projected.distance });
    }
  }
  return snaps.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

function pointAt(link: GraphLink, offset: number): LatLng {
  const { coords, offsets } = link;
  if (offset <= 0) return coords[0];
  if (offset >= link.length) return coords[coords.length - 1];
  let i = 1;
  while (i < offsets.length - 1 && offsets[i] < offset) i++;
  const segment = offsets[i] - offsets[i - 1];
  const t = segment === 0 ? 0 : (offset - offsets[i - 1]) / segment;
  return [
    coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
    coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
  ];
}

/** Stück eines Links von `a` nach `b` (Meter), in Fahrtrichtung `a → b`. */
function slice(link: GraphLink, a: number, b: number): LatLng[] {
  const out: LatLng[] = [pointAt(link, a)];
  if (a <= b) {
    for (let i = 0; i < link.coords.length; i++) {
      if (link.offsets[i] > a && link.offsets[i] < b) out.push(link.coords[i]);
    }
  } else {
    for (let i = link.coords.length - 1; i >= 0; i--) {
      if (link.offsets[i] < a && link.offsets[i] > b) out.push(link.coords[i]);
    }
  }
  out.push(pointAt(link, b));
  return out;
}

interface Exit {
  node: number;
  cost: number;
  geometry: LatLng[];
}

function exitsFromSnap(link: GraphLink, snap: Snap): Exit[] {
  const exits: Exit[] = [];
  if (link.forward) {
    exits.push({
      node: link.to,
      cost: link.length - snap.offset,
      geometry: slice(link, snap.offset, link.length),
    });
  }
  if (link.backward) {
    exits.push({
      node: link.from,
      cost: snap.offset,
      geometry: slice(link, snap.offset, 0),
    });
  }
  return exits;
}

function entriesToSnap(link: GraphLink, snap: Snap): Exit[] {
  const entries: Exit[] = [];
  if (link.forward) {
    entries.push({
      node: link.from,
      cost: snap.offset,
      geometry: slice(link, 0, snap.offset),
    });
  }
  if (link.backward) {
    entries.push({
      node: link.to,
      cost: link.length - snap.offset,
      geometry: slice(link, link.length, snap.offset),
    });
  }
  return entries;
}

/** Minimaler Binär-Heap nach Kosten. */
class MinHeap {
  private items: { node: number; cost: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(item: { node: number; cost: number }) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].cost <= items[i].cost) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].cost < items[smallest].cost) smallest = l;
        if (r < items.length && items[r].cost < items[smallest].cost) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

interface Route {
  cost: number;
  geometry: LatLng[];
}

function shortestRoute(
  graph: MotorwayGraph,
  start: Snap,
  end: Snap,
  limit: number
): Route | undefined {
  const startLink = graph.links[start.link];
  const endLink = graph.links[end.link];
  let best: Route | undefined;

  if (start.link === end.link) {
    if (startLink.forward && end.offset >= start.offset) {
      best = {
        cost: end.offset - start.offset,
        geometry: slice(startLink, start.offset, end.offset),
      };
    } else if (startLink.backward && end.offset <= start.offset) {
      best = {
        cost: start.offset - end.offset,
        geometry: slice(startLink, start.offset, end.offset),
      };
    }
    if (best) return best;
  }

  const entries = new Map<number, Exit>();
  for (const entry of entriesToSnap(endLink, end)) entries.set(entry.node, entry);
  if (entries.size === 0) return undefined;

  const dist = new Map<number, number>();
  const previous = new Map<number, { node: number; edge: Edge } | { exit: Exit }>();
  const heap = new MinHeap();
  for (const exit of exitsFromSnap(startLink, start)) {
    if (exit.cost < (dist.get(exit.node) ?? Infinity)) {
      dist.set(exit.node, exit.cost);
      previous.set(exit.node, { exit });
      heap.push({ node: exit.node, cost: exit.cost });
    }
  }

  let bestNode: number | undefined;
  let bestCost = Infinity;
  while (heap.size > 0) {
    const { node, cost } = heap.pop();
    if (cost > (dist.get(node) ?? Infinity)) continue;
    if (cost >= bestCost || cost > limit) break;
    const entry = entries.get(node);
    if (entry && cost + entry.cost < bestCost) {
      bestCost = cost + entry.cost;
      bestNode = node;
    }
    for (const edge of graph.edges.get(node) ?? []) {
      const next = cost + graph.links[edge.link].length;
      if (next < (dist.get(edge.target) ?? Infinity)) {
        dist.set(edge.target, next);
        previous.set(edge.target, { node, edge });
        heap.push({ node: edge.target, cost: next });
      }
    }
  }
  if (bestNode === undefined || bestCost > limit) return undefined;

  const pieces: LatLng[][] = [entries.get(bestNode)!.geometry];
  let current = bestNode;
  for (;;) {
    const step = previous.get(current)!;
    if ('exit' in step) {
      pieces.push(step.exit.geometry);
      break;
    }
    const link = graph.links[step.edge.link];
    pieces.push(step.edge.reverse ? [...link.coords].reverse() : link.coords);
    current = step.node;
  }
  return { cost: bestCost, geometry: pieces.reverse().flat() };
}

function round(point: LatLng): LatLng {
  return [
    Math.round(point[0] * COORD_SCALE) / COORD_SCALE,
    Math.round(point[1] * COORD_SCALE) / COORD_SCALE,
  ];
}

function cleanGeometry(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const point of points.map(round)) {
    const last = out[out.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  return out;
}

export interface PathOptions {
  /** Höchster Abstand zwischen Meldungspunkt und Fahrbahn. */
  snapRadiusMeters?: number;
  /** Erlaubter Weg: `detourFactor × Luftlinie + maxDetourMeters`. */
  detourFactor?: number;
  maxDetourMeters?: number;
}

export interface PathResult {
  path: LatLng[];
  approximate: boolean;
}

const MAX_CANDIDATES = 6;

export function findMotorwayPath(
  graph: MotorwayGraph,
  from: LatLng,
  to: LatLng,
  {
    snapRadiusMeters = 150,
    detourFactor = 1.5,
    maxDetourMeters = 1000,
  }: PathOptions = {}
): PathResult {
  const straight: PathResult = { path: [from, to], approximate: true };
  if (from[0] === to[0] && from[1] === to[1]) {
    return { path: [from], approximate: false };
  }

  const starts = snapCandidates(graph, from, snapRadiusMeters, MAX_CANDIDATES);
  const ends = snapCandidates(graph, to, snapRadiusMeters, MAX_CANDIDATES);
  if (starts.length === 0 || ends.length === 0) return straight;

  const limit = detourFactor * metersBetween(from, to) + maxDetourMeters;
  let best: (Route & { score: number }) | undefined;
  for (const start of starts) {
    for (const end of ends) {
      const route = shortestRoute(graph, start, end, limit);
      if (!route) continue;
      // Abstand zur Fahrbahn zählt mit, damit bei gleich langem Weg die
      // nähere Fahrbahn gewinnt.
      const score = route.cost + start.distance + end.distance;
      if (!best || score < best.score) best = { ...route, score };
    }
  }
  if (!best) return straight;

  return { path: cleanGeometry(best.geometry), approximate: false };
}
