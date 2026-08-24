import type { LatLngPosition } from '../geo';
import type { BlockStore } from './blockStore';
import type { TerrainBlock } from './blockStore';
import { decodeHeight } from './encoding';
import { blockForPoint, pixelInBlock } from './grid';
import { wgs84ToLaea, type LaeaPoint } from './projection';
import {
  TERRAIN_LEVEL_ORDER,
  terrainLevel,
  type TerrainLevel,
} from './terrainIndexTypes';
import type { TerrainSample } from './terrainTypes';

/**
 * Bilineare Höhenabfrage.
 *
 * Bilinear und nicht nächster Nachbar, weil ein Höhenprofil sonst Treppen
 * zeigt, die keine Steigung sind — bei 1 m Raster und 10 m Abtastung wären das
 * genau die Stufen, aus denen die Förderberechnung ihre Druckverluste zieht.
 *
 * An nodata-Rändern gilt: fehlt einer der vier Nachbarn, ist das Ergebnis
 * `null`. Ein aus drei Werten interpoliertes Pixel am Rand der Datenabdeckung
 * wäre eine erfundene Höhe, und erfundene Höhen sind in einem Profil nicht von
 * echten zu unterscheiden.
 */

/**
 * Höhe an einer Pixelmitte, aus dem Block geholt, in dem sie liegt.
 *
 * Gerundet wird, weil `centre` konstruktiv auf einer Pixelmitte liegt und nur
 * Gleitkommarauschen bleibt.
 */
async function heightAtPixel(
  store: BlockStore,
  level: TerrainLevel,
  centre: LaeaPoint
): Promise<number | undefined> {
  const block = await store.block(
    level.id,
    blockForPoint(centre, level.blockSizeM)
  );
  if (!block) return undefined;
  const { col, row } = pixelInBlock(centre, block.block, level.resolutionM);
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || r < 0 || c >= block.sizePx || r >= block.sizePx) {
    return undefined;
  }
  return decodeHeight(block.heights[r * block.sizePx + c], level);
}

/**
 * Höhe in einer Stufe, **über Blockgrenzen hinweg** interpoliert.
 *
 * Die vier Nachbarpixel werden einzeln in ihrem jeweiligen Block gesucht,
 * nicht in einem gemeinsamen. Sonst bliebe an jeder Blockkante ein halber
 * Meter ohne Antwort — der Nachbarpixel liegt dort schon im nächsten Block —
 * und ein Höhenprofil hätte alle 1000 m eine Lücke.
 *
 * Liegt der Punkt exakt auf einer Pixelmitte, wird der Nachbar nicht
 * angefordert. Am Rand der Datenabdeckung ist das der Unterschied zwischen
 * einer Höhe und `null`.
 */
async function sampleAtLevel(
  store: BlockStore,
  level: TerrainLevel,
  point: LaeaPoint
): Promise<TerrainSample | null> {
  const res = level.resolutionM;
  const gx = point.e / res;
  const gy = point.n / res;
  const west = Math.floor(gx);
  const south = Math.floor(gy);
  const fx = gx - west;
  const fy = gy - south;
  const east = fx > 0 ? west + 1 : west;
  const north = fy > 0 ? south + 1 : south;

  const centre = (c: number, r: number): LaeaPoint => ({
    e: c * res,
    n: r * res,
  });

  const [southWest, southEast, northWest, northEast] = await Promise.all([
    heightAtPixel(store, level, centre(west, south)),
    heightAtPixel(store, level, centre(east, south)),
    heightAtPixel(store, level, centre(west, north)),
    heightAtPixel(store, level, centre(east, north)),
  ]);
  if (
    southWest === undefined ||
    southEast === undefined ||
    northWest === undefined ||
    northEast === undefined
  ) {
    return null;
  }

  const lower = southWest + (southEast - southWest) * fx;
  const upper = northWest + (northEast - northWest) * fx;
  return { heightM: lower + (upper - lower) * fy, level: level.id };
}

/** Höhe an einem Punkt, in der feinsten Stufe, die dort antwortet. */
export async function sampleTerrainAt(
  store: BlockStore,
  point: LaeaPoint
): Promise<TerrainSample | null> {
  const index = await store.index();
  if (!index) return null;
  for (const levelId of TERRAIN_LEVEL_ORDER) {
    const level = terrainLevel(index, levelId);
    if (!level) continue;
    const sample = await sampleAtLevel(store, level, point);
    if (sample) return sample;
  }
  return null;
}

/**
 * Höhen zu einer Folge von Positionen.
 *
 * Je Position wird die feinste verfügbare Stufe genommen, nicht durchgehend
 * eine — an der Landesgrenze und solange erst die Übersichtsstufe hochgeladen
 * ist, läge sonst die halbe Strecke ohne Höhe da. Welche Stufe geantwortet
 * hat, steht in `level` und gehört in die Anzeige: ein Profil aus zwei Stufen
 * ist brauchbar, aber der Betrachter soll es wissen.
 */
export async function sampleTerrain(
  store: BlockStore,
  positions: LatLngPosition[]
): Promise<(TerrainSample | null)[]> {
  const samples: (TerrainSample | null)[] = [];
  for (const position of positions) {
    samples.push(await sampleTerrainAt(store, wgs84ToLaea(position)));
  }
  return samples;
}

/**
 * Bilineare Abfrage innerhalb **eines** Blocks.
 *
 * Verlangt alle vier Nachbarpixel in diesem Block und gibt sonst `null` — das
 * Zusammensetzen über Blockgrenzen ist Sache von `sampleTerrainAt`. Genutzt
 * wird das dort, wo ein Block ohnehin in der Hand liegt, etwa beim Aufbau des
 * Gitters für die Höhenlinien.
 */
export function sampleBlock(
  block: TerrainBlock,
  point: LaeaPoint
): TerrainSample | null {
  const { col, row } = pixelInBlock(
    point,
    block.block,
    block.level.resolutionM
  );
  const last = block.sizePx - 1;
  if (col < 0 || row < 0 || col > last || row > last) return null;

  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const fx = col - c0;
  const fy = row - r0;
  const c1 = fx > 0 ? c0 + 1 : c0;
  const r1 = fy > 0 ? r0 + 1 : r0;

  const at = (c: number, r: number): number | undefined =>
    decodeHeight(block.heights[r * block.sizePx + c], block.level);

  const topLeft = at(c0, r0);
  const topRight = at(c1, r0);
  const bottomLeft = at(c0, r1);
  const bottomRight = at(c1, r1);
  if (
    topLeft === undefined ||
    topRight === undefined ||
    bottomLeft === undefined ||
    bottomRight === undefined
  ) {
    return null;
  }

  const top = topLeft + (topRight - topLeft) * fx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * fx;
  return { heightM: top + (bottom - top) * fy, level: block.level.id };
}
