import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  blocksForBounds,
  type BlockRef,
  type LaeaBounds,
} from '../../common/terrain/grid';
import { wgs84ToLaea } from '../../common/terrain/projection';

/**
 * Die Landesgrenze, an der das Höhenmodell abgeschnitten wird.
 *
 * Ohne Verschneidung wäre das Ergebnis fast dreimal so groß: die Bounding-Box
 * des Burgenlands umfasst 10.850 km², das Land selbst 3.965 km².
 *
 * Quelle sind die Gemeindepolygone des ArcGIS-Servers des Landes — derselbe
 * Dienst, aus dem die Karte schon ihre WMS-Layer bezieht. Das erspart den
 * 51,8-MB-Download der BEV-Verwaltungsgrenzen **und** einen Shapefile-Parser,
 * und dieselbe Abfrage liefert die Gemeindeliste, die die Kalibrierung braucht.
 *
 * Namensnennung: „Land Burgenland (CC BY 4.0)".
 */

export const GEMEINDEN_URL =
  'https://gisenterprise.bgld.gv.at/arcgis/rest/services/public/ESRI_Webmap/MapServer/6/query';

/** Der Dienst antwortet mit `exceededTransferLimit`, es muss geblättert werden. */
const PAGE_SIZE = 100;

export interface Gemeinde {
  name: string;
  gkz: string;
  bezirk: string;
  /** Ringe in EPSG:3035. */
  rings: { e: number; n: number }[][];
}

interface GeoJsonFeature {
  properties?: { GEMNAME?: string; GKZ_C?: string; BEZNAME?: string };
  geometry?: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

const ringsOf = (feature: GeoJsonFeature): { e: number; n: number }[][] => {
  const geometry = feature.geometry;
  if (!geometry) return [];
  const polygons =
    geometry.type === 'MultiPolygon'
      ? (geometry.coordinates as number[][][][])
      : [geometry.coordinates as number[][][]];
  return polygons.flatMap((polygon) =>
    polygon.map((ring) =>
      ring.map(([lng, lat]) => wgs84ToLaea([lat, lng]))
    )
  );
};

async function fetchGemeinden(): Promise<Gemeinde[]> {
  const gemeinden: Gemeinde[] = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: 'GEMNAME,GKZ_C,BEZNAME',
      returnGeometry: 'true',
      f: 'geojson',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });
    const response = await fetch(`${GEMEINDEN_URL}?${params}`);
    if (!response.ok) {
      throw new Error(`${GEMEINDEN_URL}: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      features?: GeoJsonFeature[];
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
    };
    const features = body.features ?? [];
    for (const feature of features) {
      gemeinden.push({
        name: feature.properties?.GEMNAME ?? '',
        gkz: feature.properties?.GKZ_C ?? '',
        bezirk: feature.properties?.BEZNAME ?? '',
        rings: ringsOf(feature),
      });
    }

    const more =
      body.exceededTransferLimit ??
      body.properties?.exceededTransferLimit ??
      false;
    if (!more || features.length === 0) break;
    offset += features.length;
  }

  return gemeinden;
}

/** Gemeindegrenzen, einmalig im Cache-Ordner abgelegt. */
export async function burgenlandGemeinden(
  cacheDir: string
): Promise<Gemeinde[]> {
  const file = path.join(cacheDir, 'burgenland-gemeinden.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Gemeinde[];
  } catch {
    const gemeinden = await fetchGemeinden();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(gemeinden));
    return gemeinden;
  }
}

/** Bounding-Box aller Gemeinden, auf die Blockgröße erweitert. */
export function gemeindenBounds(
  gemeinden: Gemeinde[],
  blockSizeM: number
): LaeaBounds {
  let eMin = Number.POSITIVE_INFINITY;
  let eMax = Number.NEGATIVE_INFINITY;
  let nMin = Number.POSITIVE_INFINITY;
  let nMax = Number.NEGATIVE_INFINITY;

  for (const gemeinde of gemeinden) {
    for (const ring of gemeinde.rings) {
      for (const { e, n } of ring) {
        if (e < eMin) eMin = e;
        if (e > eMax) eMax = e;
        if (n < nMin) nMin = n;
        if (n > nMax) nMax = n;
      }
    }
  }

  const floor = (value: number) => Math.floor(value / blockSizeM) * blockSizeM;
  const ceil = (value: number) => Math.ceil(value / blockSizeM) * blockSizeM;
  return {
    eMin: floor(eMin),
    eMax: ceil(eMax),
    nMin: floor(nMin),
    nMax: ceil(nMax),
  };
}

const pointInRing = (
  point: { e: number; n: number },
  ring: { e: number; n: number }[]
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.n > point.n !== b.n > point.n &&
      point.e < ((b.e - a.e) * (point.n - a.n)) / (b.n - a.n) + a.e
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const segmentCrossesBlock = (
  a: { e: number; n: number },
  b: { e: number; n: number },
  block: BlockRef
): boolean => {
  // Grobe, aber ausreichende Prüfung: berührt die Bounding-Box des Segments den
  // Block, und liegt einer der Endpunkte darin oder die Box überlappt? Ein
  // Block zu viel kostet 310 KB, ein Block zu wenig ein Loch in der Karte.
  const eMin = Math.min(a.e, b.e);
  const eMax = Math.max(a.e, b.e);
  const nMin = Math.min(a.n, b.n);
  const nMax = Math.max(a.n, b.n);
  return (
    eMax >= block.e &&
    eMin <= block.e + block.sizeM &&
    nMax >= block.n &&
    nMin <= block.n + block.sizeM
  );
};

/**
 * Alle Blöcke, die das Burgenland berühren.
 *
 * Geprüft werden Mittelpunkt und Ecken auf Lage im Polygon sowie die Segmente
 * auf Überlappung mit dem Block. **Bei Zweifel wird der Block aufgenommen** —
 * ein Block zu viel kostet 310 KB Speicher, ein Block zu wenig eine Lücke im
 * Höhenmodell, die im Einsatz auffällt.
 */
export function burgenlandBlocks(
  level: { blockSizeM: number; bounds: LaeaBounds },
  gemeinden: Gemeinde[]
): BlockRef[] {
  const candidates = blocksForBounds(level.bounds, level.blockSizeM);
  const rings = gemeinden.flatMap((gemeinde) => gemeinde.rings);

  return candidates.filter((block) => {
    const probes = [
      { e: block.e + block.sizeM / 2, n: block.n + block.sizeM / 2 },
      { e: block.e, n: block.n },
      { e: block.e + block.sizeM, n: block.n },
      { e: block.e, n: block.n + block.sizeM },
      { e: block.e + block.sizeM, n: block.n + block.sizeM },
    ];
    for (const ring of rings) {
      if (probes.some((probe) => pointInRing(probe, ring))) return true;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        if (segmentCrossesBlock(ring[i], ring[j], block)) return true;
      }
    }
    return false;
  });
}
