/**
 * Baut aus dem GIP.at-OGD-Export (GIP 2.0, Routingexport) das gerichtete Netz
 * der Autobahnen und Schnellstraßen für die Verkehrsmeldungen und schreibt es
 * nach src/server/roadEvents/data/gip-motorways.json.
 *
 * Gebraucht werden drei Dateien aus
 * https://open.gip.gv.at/ogd/A_routingexport_ogd_split.zip:
 *   idf_LINK.txt             (~790 MB entpackt)
 *   idf_NODE.txt             (~400 MB entpackt)
 *   idf_LINK_COORDINATE.txt  (~4,8 GB entpackt)
 * Es genügen auch vorgefilterte Fassungen im selben IDF-Format.
 *
 * LINK_COORDINATE enthält nur die Zwischenpunkte eines Links, Anfang und
 * Ende liegen auf den Knoten aus idf_NODE. Ein gerader Link hat gar keine
 * Zwischenpunkte.
 *
 * Verwendung:
 *   npm run extractGipMotorways -- <idf_LINK.txt> <idf_NODE.txt> <idf_LINK_COORDINATE.txt>
 *
 * Lizenz der Daten: CC BY 4.0, Datenquelle: gip.gv.at
 * Hintergrund: docs/verkehrsmeldungen.md
 */
import { createReadStream, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { createInterface } from 'readline';
import {
  encodeCoordinates,
  EncodedLink,
  LinkDirection,
  MotorwayNetworkFile,
} from './roadEvents/motorwayPath';

type LatLng = [number, number];

const OUTPUT = 'src/server/roadEvents/data/gip-motorways.json';
const CATEGORIES = new Set(['A', 'S']);
/** Toleranz der Vereinfachung in Metern. */
const SIMPLIFY_METERS = 2;

interface LinkRecord {
  from: number;
  to: number;
  direction: LinkDirection;
  /** Amtliche Länge in Metern, nur zur Probe. */
  length: number;
}

/** Liest eine IDF-Datei und ruft `onRecord` je `rec`-Zeile mit Feldzugriff nach Name. */
async function readIdf(
  file: string,
  onRecord: (get: (name: string) => string) => void
): Promise<void> {
  const reader = createInterface({
    input: createReadStream(file, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  let columns = new Map<string, number>();
  for await (const line of reader) {
    if (line.startsWith('atr;')) {
      columns = new Map(line.split(';').map((name, i) => [name.trim(), i]));
      continue;
    }
    if (!line.startsWith('rec;')) continue;
    const fields = line.split(';');
    onRecord((name) => {
      const index = columns.get(name);
      if (index === undefined) throw new Error(`Spalte ${name} fehlt in ${file}`);
      return (fields[index] ?? '').replace(/^"|"$/g, '');
    });
  }
}

/** ONEWAY_CAR: 2 = beide Richtungen, 1 = nur in Digitalisierungsrichtung, 0 = nur dagegen. */
function toDirection(onewayCar: string): LinkDirection | undefined {
  if (onewayCar === '2') return 2;
  if (onewayCar === '1') return 1;
  if (onewayCar === '0') return 0;
  return undefined;
}

function meters(a: LatLng, b: LatLng): { x: number; y: number } {
  const cos = Math.cos((a[0] * Math.PI) / 180);
  return {
    x: (b[1] - a[1]) * 111320 * cos,
    y: (b[0] - a[0]) * 110540,
  };
}

function distance(a: LatLng, b: LatLng): number {
  const d = meters(a, b);
  return Math.hypot(d.x, d.y);
}

function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const ab = meters(a, b);
  const ap = meters(a, p);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / lenSq));
  const dx = ap.x - t * ab.x;
  const dy = ap.y - t * ab.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Douglas-Peucker; Anfang und Ende bleiben immer erhalten. */
function simplify(points: LatLng[], tolerance: number): LatLng[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(points[i], points[start], points[end]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

async function main() {
  const [linkFile, nodeFile, coordinateFile] = process.argv.slice(2);
  if (!linkFile || !nodeFile || !coordinateFile) {
    console.error(
      'Verwendung: npm run extractGipMotorways -- <idf_LINK.txt> <idf_NODE.txt> <idf_LINK_COORDINATE.txt>'
    );
    process.exit(1);
  }

  const links = new Map<string, LinkRecord>();
  let skipped = 0;
  await readIdf(linkFile, (get) => {
    if (!CATEGORIES.has(get('EDGE_CATEGORY'))) return;
    const direction = toDirection(get('ONEWAY_CAR'));
    if (direction === undefined) {
      skipped++;
      return;
    }
    links.set(get('SHORT_ID'), {
      from: Number(get('NODE_FROM_SHORT_ID')),
      to: Number(get('NODE_TO_SHORT_ID')),
      direction,
      length: Number(get('LENGTH')),
    });
  });
  console.log(`${links.size} Links (A/S), ${skipped} ohne Kfz-Fahrtrichtung übersprungen`);

  const usedNodes = new Set<number>();
  for (const link of links.values()) {
    usedNodes.add(link.from);
    usedNodes.add(link.to);
  }
  const nodes = new Map<number, LatLng>();
  await readIdf(nodeFile, (get) => {
    const id = Number(get('SHORT_ID'));
    if (usedNodes.has(id)) nodes.set(id, [Number(get('Y')), Number(get('X'))]);
  });
  console.log(`${nodes.size} von ${usedNodes.size} Knoten gefunden`);

  const points = new Map<string, { seq: number; point: LatLng }[]>();
  await readIdf(coordinateFile, (get) => {
    const linkId = get('LINK_SHORT_ID');
    if (!links.has(linkId)) return;
    const entry = {
      seq: Number(get('SEQUENCE')),
      point: [Number(get('Y')), Number(get('X'))] as LatLng,
    };
    const list = points.get(linkId);
    if (list) list.push(entry);
    else points.set(linkId, [entry]);
  });

  const encoded: EncodedLink[] = [];
  let rawPoints = 0;
  let keptPoints = 0;
  let withoutNode = 0;
  // Probe: Der Verlauf soll die amtliche Länge treffen. Weicht er ab, stimmt
  // die angenommene Reihenfolge (Knoten, Zwischenpunkte nach SEQUENCE) nicht.
  let lengthOff = 0;
  for (const [linkId, link] of links) {
    const start = nodes.get(link.from);
    const end = nodes.get(link.to);
    if (!start || !end) {
      withoutNode++;
      continue;
    }
    const inner = (points.get(linkId) ?? [])
      .sort((a, b) => a.seq - b.seq)
      .map((p) => p.point);
    const ordered = [start, ...inner, end];
    let polylineLength = 0;
    for (let i = 1; i < ordered.length; i++) {
      polylineLength += distance(ordered[i - 1], ordered[i]);
    }
    if (Math.abs(polylineLength - link.length) > Math.max(2, link.length * 0.02)) {
      lengthOff++;
    }
    const simplified = simplify(ordered, SIMPLIFY_METERS);
    rawPoints += ordered.length;
    keptPoints += simplified.length;
    encoded.push([link.from, link.to, link.direction, encodeCoordinates(simplified)]);
  }

  const file: MotorwayNetworkFile = {
    source: 'GIP.at OGD (GIP 2.0), CC BY 4.0, Datenquelle: gip.gv.at',
    generated: new Date().toISOString().slice(0, 10),
    links: encoded,
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  const json = JSON.stringify(file);
  writeFileSync(OUTPUT, json);

  console.log(
    `${encoded.length} Links, ${rawPoints} → ${keptPoints} Stützpunkte, ` +
      `${withoutNode} ohne Knoten, ${lengthOff} mit abweichender Länge`
  );
  console.log(`${OUTPUT} geschrieben (${(json.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
