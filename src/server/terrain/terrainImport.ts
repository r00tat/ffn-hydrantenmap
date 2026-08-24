import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  encodeAvailability,
  availabilityCell,
} from '../../common/terrain/availability';
import { NODATA_ENCODED } from '../../common/terrain/encoding';
import {
  bevSourceTile,
  bevSourceTileName,
  blockId,
  blockPixelCenter,
  type BlockRef,
  type LaeaBounds,
} from '../../common/terrain/grid';
import type { TerrainIndex } from '../../common/terrain/terrainIndexTypes';
import { bevFetchRange, bevTileInfo } from './bevSource';
import { buildBlock, decimate, memoTileReader } from './blockBuilder';
import { burgenlandBlocks, burgenlandGemeinden, gemeindenBounds } from './burgenlandBoundary';
import { writeTerrainPng } from './pngWriter';
import {
  blockSizeM,
  LEVEL_SPECS,
  levelSpec,
  TERRAIN_PREFIX,
  TERRAIN_SOURCE,
  TERRAIN_VERSION,
  toTerrainLevel,
  type LevelSpec,
} from './terrainLevels';

/**
 * Erzeugt die Terrain-Kacheln des Höhenmodells aus dem BEV-ALS-DGM.
 *
 * Wiederaufnehmbar: bereits erzeugte Kacheln werden übersprungen. Die
 * dekodierten 1-m-Rohhöhen bleiben als `.f32` im Cache liegen — damit kostet
 * ein Neukodieren mit anderer Präzision Minuten statt eines neuen
 * 15-GB-Downloads.
 *
 * Aufruf:
 *   npm run terrainImport -- [--cache <dir>] [--level detail|overview|all]
 *                            [--limit <n>] [--no-upload]
 */

interface Options {
  cacheDir: string;
  level: 'detail' | 'overview' | 'all';
  limit: number;
  upload: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    cacheDir: '.terrain-cache',
    level: 'all',
    limit: Number.POSITIVE_INFINITY,
    upload: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cache') options.cacheDir = argv[(i += 1)];
    else if (arg === '--level') options.level = argv[(i += 1)] as Options['level'];
    else if (arg === '--limit') options.limit = Number(argv[(i += 1)]);
    else if (arg === '--no-upload') options.upload = false;
    else if (arg === '--upload') options.upload = true;
    else throw new Error(`Unbekannte Option: ${arg}`);
  }
  return options;
}

const rawPath = (cacheDir: string, block: BlockRef) =>
  path.join(cacheDir, 'raw', `${blockId(block)}.f32`);

const outPath = (cacheDir: string, spec: LevelSpec, block: BlockRef) =>
  path.join(cacheDir, 'out', spec.id, `${blockId(block)}.png`);

const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

/** Rohhöhen eines Detailblocks, aus dem Cache oder frisch aus der Quelle. */
async function detailHeights(
  block: BlockRef,
  spec: LevelSpec,
  cacheDir: string
): Promise<Float32Array> {
  const file = rawPath(cacheDir, block);
  if (await exists(file)) {
    const bytes = await readFile(file);
    return new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
  }

  // Die Quellkachel bestimmt sich aus der Blockmitte; ein 1-km-Block liegt
  // immer vollständig in einer 50-km-Kachel, weil beide Gitter auf 1000 m
  // ausgerichtet sind.
  const center = blockPixelCenter(block, spec.blockPx / 2, spec.blockPx / 2, spec.resolutionM);
  const tile = bevSourceTile(center);
  const tileName = bevSourceTileName(tile);
  const info = await bevTileInfo(tileName, cacheDir);
  const heights = await buildBlock({
    block,
    info,
    readTileAt: memoTileReader(info, bevFetchRange(tileName)),
    resolutionM: spec.resolutionM,
  });

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(heights.buffer));
  return heights;
}

async function buildDetail(
  blocks: BlockRef[],
  cacheDir: string,
  limit: number
): Promise<BlockRef[]> {
  const spec = levelSpec('detail');
  const written: BlockRef[] = [];
  let done = 0;

  for (const block of blocks) {
    if (written.length >= limit) break;
    const target = outPath(cacheDir, spec, block);
    if (await exists(target)) {
      written.push(block);
      done += 1;
      continue;
    }

    const heights = await detailHeights(block, spec, cacheDir);
    if (heights.every((value) => Number.isNaN(value))) {
      // Ein Block ohne einen einzigen Messwert wird nicht ausgeliefert: er
      // würde 310 KB kosten und nichts beantworten.
      done += 1;
      continue;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeTerrainPng(heights, spec.blockPx, { ...spec, nodataValue: NODATA_ENCODED }, target);
    written.push(block);
    done += 1;
    if (done % 25 === 0) {
      console.log(`detail: ${done}/${blocks.length} Blöcke`);
    }
  }

  console.log(`detail: ${written.length} Kacheln geschrieben`);
  return written;
}

/**
 * Übersichtsstufe aus den Rohdateien der Detailstufe.
 *
 * Aggregiert wird aus dem Cache, nicht erneut aus der Quelle: die 1-m-Rohhöhen
 * liegen schon auf Platte, und ein zweiter Download derselben Daten wäre
 * verschwendete Bandbreite eines kostenlos bereitgestellten Dienstes.
 */
async function buildOverview(
  detailBlocks: BlockRef[],
  cacheDir: string,
  limit: number
): Promise<BlockRef[]> {
  const detail = levelSpec('detail');
  const spec = levelSpec('overview');
  const size = blockSizeM(spec);
  const detailSize = blockSizeM(detail);
  const perSide = size / detailSize;

  const wanted = new Map<string, BlockRef>();
  for (const block of detailBlocks) {
    const parent: BlockRef = {
      e: Math.floor(block.e / size) * size,
      n: Math.floor(block.n / size) * size,
      sizeM: size,
    };
    wanted.set(blockId(parent), parent);
  }

  const written: BlockRef[] = [];
  for (const parent of wanted.values()) {
    if (written.length >= limit) break;
    const target = outPath(cacheDir, spec, parent);
    if (await exists(target)) {
      written.push(parent);
      continue;
    }

    // Erst das 1-m-Gitter des ganzen Übersichtsblocks zusammensetzen, dann in
    // einem Durchgang dezimieren — sonst würden Gruppen über Blockgrenzen
    // hinweg falsch gemittelt.
    const fineSide = perSide * detail.blockPx;
    const fine = new Float32Array(fineSide * fineSide).fill(Number.NaN);
    let anyData = false;

    for (let dy = 0; dy < perSide; dy += 1) {
      for (let dx = 0; dx < perSide; dx += 1) {
        const child: BlockRef = {
          e: parent.e + dx * detailSize,
          // Zeile 0 des Übersichtsblocks ist die nördlichste, die Kinder
          // werden von Nord nach Süd eingesetzt.
          n: parent.n + (perSide - 1 - dy) * detailSize,
          sizeM: detailSize,
        };
        const file = rawPath(cacheDir, child);
        if (!(await exists(file))) continue;
        const bytes = await readFile(file);
        const heights = new Float32Array(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          )
        );
        anyData = true;
        for (let row = 0; row < detail.blockPx; row += 1) {
          fine.set(
            heights.subarray(row * detail.blockPx, (row + 1) * detail.blockPx),
            (dy * detail.blockPx + row) * fineSide + dx * detail.blockPx
          );
        }
      }
    }

    if (!anyData) continue;

    const coarse = decimate(fine, fineSide, spec.decimateFactor);
    await mkdir(path.dirname(target), { recursive: true });
    await writeTerrainPng(
      coarse,
      spec.blockPx,
      { ...spec, nodataValue: NODATA_ENCODED },
      target
    );
    written.push(parent);
  }

  console.log(`overview: ${written.length} Kacheln geschrieben`);
  return written;
}

interface CalibrationFile {
  adriaOffsetM: number;
  adriaOffsetSdM: number;
  adriaOffsetSamples: number;
}

/** Der gemessene Adria-Offset, oder der Vorgabewert mit Warnung. */
async function readCalibration(cacheDir: string): Promise<CalibrationFile> {
  const file = path.join(cacheDir, 'terrain-calibration.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as CalibrationFile;
  } catch {
    console.warn(
      'WARNUNG: keine terrain-calibration.json — es gilt der aus einer einzigen\n' +
        '  Messstelle abgeleitete Wert 0,39 m. Für das Wasserstandsmodell ist das\n' +
        '  zu wenig; erst `npm run terrainCalibrate` laufen lassen. Für Höhenlinien\n' +
        '  und Löschwasserförderung ist es ohne Belang (dort zählen Differenzen).'
    );
    return { adriaOffsetM: 0.39, adriaOffsetSdM: 0.1, adriaOffsetSamples: 1024 };
  }
}

function buildIndex(
  bounds: Record<'detail' | 'overview', LaeaBounds>,
  blocks: Record<'detail' | 'overview', BlockRef[]>,
  calibration: CalibrationFile,
  produced: string
): TerrainIndex {
  const levels = LEVEL_SPECS.map((spec) => {
    const levelBounds = bounds[spec.id];
    const size = blockSizeM(spec);
    const cols = (levelBounds.eMax - levelBounds.eMin) / size;
    const rows = (levelBounds.nMax - levelBounds.nMin) / size;
    const present = new Set(
      blocks[spec.id].map((block) => {
        const cell = availabilityCell(
          { bounds: levelBounds, blockSizeM: size },
          block
        );
        return `${cell.col},${cell.row}`;
      })
    );
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
    adriaOffsetM: calibration.adriaOffsetM,
    adriaOffsetSdM: calibration.adriaOffsetSdM,
    adriaOffsetSamples: calibration.adriaOffsetSamples,
    source: TERRAIN_SOURCE,
    produced,
    levels,
  };
}

async function upload(cacheDir: string, index: TerrainIndex): Promise<void> {
  // Erst hier importiert, damit ein Lauf mit `--no-upload` ohne Anmeldedaten
  // funktioniert.
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getStorage } = await import('firebase-admin/storage');
  if (getApps().length === 0) initializeApp();

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'Projekt-ID unbekannt: GOOGLE_CLOUD_PROJECT oder NEXT_PUBLIC_FIREBASE_PROJECT_ID setzen'
    );
  }
  const bucket = getStorage().bucket(`${projectId}.appspot.com`);

  for (const level of index.levels) {
    for (const block of await blocksOf(cacheDir, level.id)) {
      const local = path.join(cacheDir, 'out', level.id, `${block}.png`);
      await bucket.upload(local, {
        destination: `${TERRAIN_PREFIX}/${level.id}/${block}.png`,
        metadata: {
          contentType: 'image/png',
          // Der Pfad ist versioniert, die Inhalte sind damit unveränderlich.
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
    }
    console.log(`upload: Stufe ${level.id} übertragen`);
  }

  await bucket.file(`${TERRAIN_PREFIX}/index.json`).save(
    JSON.stringify(index),
    {
      metadata: {
        contentType: 'application/json',
        // Der Index ändert sich innerhalb einer Version, wenn Kacheln
        // nachwachsen — deshalb kurz.
        cacheControl: 'public, max-age=300',
      },
    }
  );
  console.log('upload: index.json übertragen');
}

async function blocksOf(cacheDir: string, levelId: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  try {
    const files = await readdir(path.join(cacheDir, 'out', levelId));
    return files
      .filter((file) => file.endsWith('.png'))
      .map((file) => file.replace(/\.png$/, ''));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `Höhenmodell-Import, Cache ${options.cacheDir}, Stufe ${options.level}` +
      (Number.isFinite(options.limit) ? `, Grenze ${options.limit}` : '')
  );

  const gemeinden = await burgenlandGemeinden(options.cacheDir);
  console.log(`${gemeinden.length} Gemeinden geladen`);

  const detail = levelSpec('detail');
  const overview = levelSpec('overview');
  const detailBounds = gemeindenBounds(gemeinden, blockSizeM(detail));
  const overviewBounds = gemeindenBounds(gemeinden, blockSizeM(overview));

  const candidates = burgenlandBlocks(
    { blockSizeM: blockSizeM(detail), bounds: detailBounds },
    gemeinden
  );
  console.log(
    `${candidates.length} Detailblöcke berühren das Land ` +
      `(Bounding-Box hätte ${
        ((detailBounds.eMax - detailBounds.eMin) *
          (detailBounds.nMax - detailBounds.nMin)) /
        blockSizeM(detail) ** 2
      })`
  );

  const detailBlocks =
    options.level === 'overview'
      ? candidates
      : await buildDetail(candidates, options.cacheDir, options.limit);

  const overviewBlocks =
    options.level === 'detail'
      ? []
      : await buildOverview(detailBlocks, options.cacheDir, options.limit);

  const index = buildIndex(
    { detail: detailBounds, overview: overviewBounds },
    { detail: detailBlocks, overview: overviewBlocks },
    await readCalibration(options.cacheDir),
    new Date().toISOString()
  );

  const indexFile = path.join(options.cacheDir, 'out', 'index.json');
  await mkdir(path.dirname(indexFile), { recursive: true });
  await writeFile(indexFile, JSON.stringify(index, null, 2));
  console.log(`index.json geschrieben: ${indexFile}`);

  if (options.upload) await upload(options.cacheDir, index);
  else console.log('Upload übersprungen (--no-upload)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
