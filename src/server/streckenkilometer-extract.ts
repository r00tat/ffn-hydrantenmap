/**
 * Extrahiert die Streckenkilometer (km-Tafeln) der Autobahnen und
 * Schnellstraßen im Burgenland aus dem GIP.at-OGD-Export und schreibt sie
 * als GeoJSON nach public/data/streckenkilometer.geojson.
 *
 * Der GIP-OGD-Export enthält keine fertigen Kilometertafel-Punkte für
 * Autobahnen (ASFINAG publiziert keine Bezugspunkte). Die Kilometrierung
 * liegt aber als kilometrierte Richtungsfahrbahn-Routen in der Tabelle
 * LinkEdgeRoute des Routingexports vor (SUBROUTE_STARTKM/ENDKM je Route).
 * Dieses Script geht die Link-Geometrien jeder Route entlang und
 * interpoliert alle 500 m einen km-Punkt. Die beiden Richtungsfahrbahnen
 * werden anschließend je km-Wert zu einem Punkt in der Mitte zusammengeführt
 * (eine Tafel pro km-Wert reicht auf der Karte).
 *
 * Benötigte Downloads (https://www.data.gv.at, Datensatz GIP.at Österreich):
 *   https://open.gip.gv.at/ogd/A_routingexport_ogd_split.zip → LinkEdgeRoute.txt
 *   https://open.gip.gv.at/ogd/B_gip_network_ogd.zip → gip_network_ogd.gpkg
 *
 * Verwendung:
 *   npm run extractStreckenkilometer -- <LinkEdgeRoute.txt> <gip_network_ogd.gpkg>
 *
 * Lizenz der Daten: CC BY 4.0, Datenquelle: gip.gv.at
 */
import { execFileSync } from 'child_process';
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';

const ROADS = ['A4', 'A6', 'S31', 'S4', 'S7'];
const OUTPUT = 'public/data/streckenkilometer.geojson';
const KM_STEP = 0.5;
const SQLITE = '/usr/bin/sqlite3';

interface RouteRecord {
  recId: number;
  linkId: number;
  edgeDir: number;
  startKm: number;
  endKm: number;
}

interface Subroute {
  strasse: string;
  richtung: string;
  startKm: number;
  endKm: number;
  records: RouteRecord[];
}

// Routen der Hauptfahrbahnen, z.B.
// "A4 - Ost Autobahn rechte Fahrbahn (Hauptrichtung) kilometriert E"
const ROUTE_PATTERN = new RegExp(
  `^(${ROADS.join('|')}) - .* (linke|rechte) Fahrbahn \\((Haupt|Gegen)richtung\\) kilometriert`
);

async function readSubroutes(linkEdgeRouteFile: string): Promise<Subroute[]> {
  const subroutes = new Map<string, Subroute>();
  const reader = createInterface({
    input: createReadStream(linkEdgeRouteFile, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  for await (const line of reader) {
    if (!line.startsWith('rec;')) continue;
    // rec;RECID;EDGE_OBJECTID;LINKID;LINK_FROMP;LINK_TOP;EDGE_SEQ;EDGE_DIR;
    //   SUBROUTE_NAME;ROUTE_NAME;SUBROUTE_STARTKM;SUBROUTE_ENDKM;SUBROUTE_ID;...
    const fields = line.split(';');
    const routeName = (fields[9] || '').replace(/^"|"$/g, '');
    const match = ROUTE_PATTERN.exec(routeName);
    if (!match) continue;
    // "Verlängerung"-Routen (z.B. A4 Stadionbrücke) sind eigene kurze
    // Kilometrierungen und keine Streckenkilometer der Hauptstrecke.
    if (routeName.includes('Verl')) continue;
    const subrouteId = fields[12];
    let subroute = subroutes.get(subrouteId);
    if (!subroute) {
      subroute = {
        strasse: match[1],
        richtung: `${match[3]}richtung`,
        startKm: parseFloat(fields[10]),
        endKm: parseFloat(fields[11]),
        records: [],
      };
      subroutes.set(subrouteId, subroute);
    }
    subroute.records.push({
      recId: parseInt(fields[1], 10),
      linkId: parseInt(fields[3], 10),
      edgeDir: parseInt(fields[7], 10),
      startKm: parseFloat(fields[10]),
      endKm: parseFloat(fields[11]),
    });
  }
  return Array.from(subroutes.values());
}

// GPKG-Geometrie-Blob: 'GP', Version, Flags, 4 Byte srs_id, Envelope laut
// Flags-Bits 1-3, danach Standard-WKB.
export function parseGpkgLineString(hex: string): [number, number][] {
  const buf = Buffer.from(hex, 'hex');
  if (buf.toString('ascii', 0, 2) !== 'GP') {
    throw new Error('Kein GPKG-Geometrie-Blob');
  }
  const flags = buf[3];
  const envelopeSizes = [0, 32, 48, 48, 64];
  const envelopeSize = envelopeSizes[(flags >> 1) & 0x07] ?? 0;
  const wkb = buf.subarray(8 + envelopeSize);
  const littleEndian = wkb[0] === 1;
  const readUInt32 = (offset: number) =>
    littleEndian ? wkb.readUInt32LE(offset) : wkb.readUInt32BE(offset);
  const readDouble = (offset: number) =>
    littleEndian ? wkb.readDoubleLE(offset) : wkb.readDoubleBE(offset);
  // Liest einen LineString ab WKB-Offset `start`, gibt [coords, nextOffset].
  const readLineString = (start: number): [[number, number][], number] => {
    const geomType = littleEndian
      ? wkb.readUInt32LE(start + 1)
      : wkb.readUInt32BE(start + 1);
    if (geomType % 1000 !== 2) {
      throw new Error(`Kein LineString-WKB (Typ ${geomType})`);
    }
    // Dimension aus dem Typ ableiten (1002 = Z, 2002 = M, 3002 = ZM)
    const extraDims = geomType >= 3000 ? 2 : geomType >= 1000 ? 1 : 0;
    const pointSize = (2 + extraDims) * 8;
    const pointCount = littleEndian
      ? wkb.readUInt32LE(start + 5)
      : wkb.readUInt32BE(start + 5);
    const coords: [number, number][] = [];
    for (let i = 0; i < pointCount; i++) {
      const offset = start + 9 + i * pointSize;
      coords.push([readDouble(offset), readDouble(offset + 8)]);
    }
    return [coords, start + 9 + pointCount * pointSize];
  };

  const geomType = readUInt32(1);
  const baseType = geomType % 1000;
  if (baseType === 2) {
    return readLineString(0)[0];
  }
  if (baseType === 5) {
    // MultiLineString: Teilstücke aneinanderhängen (i.d.R. nur eines)
    const partCount = readUInt32(5);
    const coords: [number, number][] = [];
    let offset = 9;
    for (let part = 0; part < partCount; part++) {
      const [partCoords, nextOffset] = readLineString(offset);
      coords.push(...partCoords);
      offset = nextOffset;
    }
    return coords;
  }
  throw new Error(`Kein (Multi-)LineString-WKB (Typ ${geomType})`);
}

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function loadLinkGeometries(
  gpkg: string,
  linkIds: number[]
): Map<number, [number, number][]> {
  const geometries = new Map<number, [number, number][]>();
  const chunkSize = 500;
  for (let i = 0; i < linkIds.length; i += chunkSize) {
    const chunk = linkIds.slice(i, i + chunkSize);
    const sql = `SELECT LINK_ID, hex(geom) AS geomHex FROM GIP_LINKNETZ_OGD WHERE LINK_ID IN (${chunk.join(',')});`;
    const out = execFileSync(SQLITE, ['-json', gpkg, sql], {
      maxBuffer: 1024 * 1024 * 1024,
      encoding: 'utf8',
    });
    const rows: { LINK_ID: number; geomHex: string }[] = out.trim()
      ? JSON.parse(out)
      : [];
    rows.forEach((row) => {
      geometries.set(row.LINK_ID, parseGpkgLineString(row.geomHex));
    });
  }
  return geometries;
}

/**
 * Hängt die Link-Geometrien einer Subroute in Traversierungsreihenfolge
 * aneinander. EDGE_DIR 0 bedeutet "gegen Link-Richtung" → Koordinaten
 * umdrehen. Zur Sicherheit wird zusätzlich über die Anschlusspunkte
 * geprüft, ob die Orientierung stimmt.
 */
function buildRouteLine(
  subroute: Subroute,
  geometries: Map<number, [number, number][]>
): [number, number][] {
  const line: [number, number][] = [];
  const records = [...subroute.records].sort((a, b) => a.recId - b.recId);
  let previousLinkId: number | undefined;
  for (const record of records) {
    if (record.linkId === previousLinkId) continue; // Mehrfach-Records je Edge
    previousLinkId = record.linkId;
    const geometry = geometries.get(record.linkId);
    if (!geometry) {
      console.warn(
        `${subroute.strasse} ${subroute.richtung}: Link ${record.linkId} ohne Geometrie — übersprungen`
      );
      continue;
    }
    let coords = record.edgeDir === 0 ? [...geometry].reverse() : geometry;
    if (line.length > 0) {
      const end = line[line.length - 1];
      // Orientierung anhand des Anschlusspunkts verifizieren
      if (
        haversineMeters(end, coords[0]) >
        haversineMeters(end, coords[coords.length - 1])
      ) {
        coords = [...coords].reverse();
      }
      const gap = haversineMeters(end, coords[0]);
      if (gap > 100) {
        console.warn(
          `${subroute.strasse} ${subroute.richtung}: Lücke von ${Math.round(gap)} m vor Link ${record.linkId}`
        );
      }
    }
    line.push(...coords);
  }
  return line;
}

interface KmPoint {
  strasse: string;
  km: number;
  richtung: string;
  lng: number;
  lat: number;
}

/** Interpoliert alle KM_STEP-Vielfachen entlang der Routen-Geometrie. */
function interpolateKmPoints(
  subroute: Subroute,
  line: [number, number][]
): KmPoint[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMeters(line[i - 1], line[i]));
  }
  const geoLength = cumulative[cumulative.length - 1];
  const kmSpan = subroute.endKm - subroute.startKm;
  const deviation = Math.abs(geoLength / 1000 - kmSpan) / kmSpan;
  console.log(
    `${subroute.strasse} ${subroute.richtung}: km ${subroute.startKm}–${subroute.endKm} ` +
      `(${kmSpan.toFixed(1)} km), Geometrie ${(geoLength / 1000).toFixed(1)} km, ` +
      `Abweichung ${(deviation * 100).toFixed(1)}%`
  );

  const points: KmPoint[] = [];
  let segment = 0;
  const firstKm = Math.ceil(subroute.startKm / KM_STEP) * KM_STEP;
  for (let km = firstKm; km <= subroute.endKm; km += KM_STEP) {
    // km linear auf die Geometrie-Länge abbilden (gleicht Projektions-
    // und Digitalisierungs-Differenzen über die Gesamtlänge aus)
    const target = ((km - subroute.startKm) / kmSpan) * geoLength;
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < target) {
      segment++;
    }
    const segmentLength = cumulative[segment + 1] - cumulative[segment];
    const t =
      segmentLength > 0 ? (target - cumulative[segment]) / segmentLength : 0;
    const [lng1, lat1] = line[segment];
    const [lng2, lat2] = line[segment + 1];
    points.push({
      strasse: subroute.strasse,
      km: Math.round(km * 10) / 10,
      richtung: subroute.richtung,
      lng: Math.round((lng1 + (lng2 - lng1) * t) * 1e6) / 1e6,
      lat: Math.round((lat1 + (lat2 - lat1) * t) * 1e6) / 1e6,
    });
  }
  return points;
}

async function main() {
  const [linkEdgeRouteFile, gpkg] = process.argv.slice(2);
  if (!linkEdgeRouteFile || !gpkg) {
    console.error(
      'Verwendung: streckenkilometer-extract <LinkEdgeRoute.txt> <gip_network_ogd.gpkg>'
    );
    process.exit(1);
  }

  console.log('Lese LinkEdgeRoute…');
  const subroutes = await readSubroutes(linkEdgeRouteFile);
  if (subroutes.length === 0) {
    console.error('Keine kilometrierten Routen gefunden — ROUTE_PATTERN prüfen!');
    process.exit(1);
  }
  console.log(`${subroutes.length} Richtungsfahrbahn-Routen gefunden`);

  const linkIds = Array.from(
    new Set(
      subroutes.flatMap((subroute) =>
        subroute.records.map((record) => record.linkId)
      )
    )
  );
  console.log(`Lade ${linkIds.length} Link-Geometrien…`);
  const geometries = loadLinkGeometries(gpkg, linkIds);

  const directionalPoints = subroutes.flatMap((subroute) =>
    interpolateKmPoints(subroute, buildRouteLine(subroute, geometries))
  );

  // Beide Richtungsfahrbahnen je km-Wert zu einem Punkt in der Mitte
  // zusammenführen — eine Tafel pro km-Wert reicht auf der Karte.
  const merged = new Map<string, KmPoint[]>();
  directionalPoints.forEach((point) => {
    const key = `${point.strasse}-${point.km}`;
    merged.set(key, [...(merged.get(key) || []), point]);
  });
  const points = Array.from(merged.values()).map((group) => ({
    strasse: group[0].strasse,
    km: group[0].km,
    lng:
      Math.round(
        (group.reduce((sum, p) => sum + p.lng, 0) / group.length) * 1e6
      ) / 1e6,
    lat:
      Math.round(
        (group.reduce((sum, p) => sum + p.lat, 0) / group.length) * 1e6
      ) / 1e6,
  }));

  const counts: Record<string, number> = {};
  points.forEach((point) => {
    counts[point.strasse] = (counts[point.strasse] || 0) + 1;
  });
  console.log('Punkte je Straße:', counts);

  const featureCollection = {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
      properties: {
        strasse: point.strasse,
        km: point.km,
      },
    })),
  };
  writeFileSync(OUTPUT, JSON.stringify(featureCollection));
  console.log(`${points.length} Punkte → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
