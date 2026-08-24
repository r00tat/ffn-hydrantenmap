import {
  availabilityCell,
  encodeAvailability,
} from '../../common/terrain/availability';
import { parseBlockId, type LaeaBounds } from '../../common/terrain/grid';
import type {
  AdriaOffsetGrid,
  TerrainIndex,
  TerrainLevelId,
} from '../../common/terrain/terrainIndexTypes';
import { TERRAIN_VERSION } from '../../common/terrain/terrainPaths';
import {
  blockSizeM,
  LEVEL_SPECS,
  TERRAIN_SOURCE,
  toTerrainLevel,
} from './terrainLevels';

/**
 * Der Kachel-Index aus dem, was **tatsächlich vorliegt**.
 *
 * Die Blocknamen kommen aus dem Ausgabeverzeichnis des Caches, nicht aus dem,
 * was der laufende Import gerade gebaut hat. Der Unterschied ist keiner von
 * Geschmack — er entscheidet darüber, ob ein Import in Etappen funktioniert:
 *
 * - Ein Lauf mit `--level detail` hätte sonst für die Übersichtsstufe eine
 *   leere Bitmap geschrieben. Die schon hochgeladenen Übersichtskacheln wären
 *   damit für jeden Client verschwunden, obwohl sie im Speicher liegen.
 * - Ein Lauf mit `--level overview` hätte umgekehrt **alle** Kandidaten der
 *   Detailstufe als vorhanden gemeldet, auch die nie gebauten — und jeder
 *   Client hätte sie einzeln als 404 abgeholt, genau das, was die Bitmap
 *   verhindern soll.
 *
 * Aus dem Verzeichnis gelesen ist der Index in jeder Kombination richtig, auch
 * nach einem Abbruch und auch bei einem Lauf mit `--limit`.
 */
export function buildIndex(
  bounds: Record<TerrainLevelId, LaeaBounds>,
  /** Blocknamen je Stufe, wie sie im Cache liegen. */
  blockIds: Record<TerrainLevelId, string[]>,
  adriaOffset: AdriaOffsetGrid,
  produced: string
): TerrainIndex {
  const levels = LEVEL_SPECS.map((spec) => {
    const levelBounds = bounds[spec.id];
    const size = blockSizeM(spec);
    const cols = (levelBounds.eMax - levelBounds.eMin) / size;
    const rows = (levelBounds.nMax - levelBounds.nMin) / size;

    const present = new Set<string>();
    for (const id of blockIds[spec.id]) {
      const block = parseBlockId(id);
      // Ein Name, der nicht zu dieser Stufe gehört, wird übergangen statt
      // geraten: im Ausgabeverzeichnis kann nach einem Wechsel der Blockgröße
      // eine Kachel aus einem früheren Lauf liegen.
      if (!block || block.sizeM !== size) continue;
      const cell = availabilityCell(
        { bounds: levelBounds, blockSizeM: size },
        block
      );
      if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row)) continue;
      if (cell.col < 0 || cell.row < 0 || cell.col >= cols || cell.row >= rows) {
        continue;
      }
      present.add(`${cell.col},${cell.row}`);
    }

    return toTerrainLevel(
      spec,
      levelBounds,
      encodeAvailability(cols, rows, (col, row) => present.has(`${col},${row}`))
    );
  });

  return {
    version: TERRAIN_VERSION,
    crs: 'EPSG:3035',
    heightDatum: 'EVRF2000',
    adriaOffset,
    source: TERRAIN_SOURCE,
    produced,
    levels,
  };
}
