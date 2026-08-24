import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NODATA_ENCODED } from '../../common/terrain/encoding';
import {
  terrainBlockPath,
  terrainBucket,
  TERRAIN_INDEX_PATH,
  TERRAIN_PREFIX,
} from '../../common/terrain/terrainPaths';
import {
  bevSourceTile,
  bevSourceTileName,
  blockId,
  blockPixelCenter,
  parseBlockId,
  type BlockRef,
  type LaeaBounds,
} from '../../common/terrain/grid';
import type {
  AdriaOffsetGrid,
  TerrainIndex,
} from '../../common/terrain/terrainIndexTypes';
import { bevFetchRange, bevTileInfo } from './bevSource';
import { buildBlock, decimate, memoTileReader } from './blockBuilder';
import { burgenlandBlocks, burgenlandGemeinden, gemeindenBounds } from './burgenlandBoundary';
import { writeTerrainPng } from './pngWriter';
import { buildIndex } from './terrainIndex';
import { blocksToUpload, runPooled } from './uploadPlan';
import {
  blockSizeM,
  LEVEL_SPECS,
  levelSpec,
  type LevelSpec,
} from './terrainLevels';

/**
 * Erzeugt die Terrain-Kacheln des Höhenmodells aus dem BEV-ALS-DGM.
 *
 * Wiederaufnehmbar: bereits erzeugte Kacheln werden übersprungen, ebenso
 * bereits übertragene. Die dekodierten 1-m-Rohhöhen bleiben als `.f32` im
 * Cache liegen — damit kostet ein Neukodieren mit anderer Präzision Minuten
 * statt eines neuen 15-GB-Downloads.
 *
 * Aufruf:
 *   npm run terrainImport -- [--cache <dir>] [--level detail|overview|all]
 *                            [--limit <n>] [--no-upload] [--reupload]
 */

interface Options {
  cacheDir: string;
  level: 'detail' | 'overview' | 'all';
  limit: number;
  upload: boolean;
  /** Auch Kacheln übertragen, die im Speicher schon liegen. */
  reupload: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    cacheDir: '.terrain-cache',
    level: 'all',
    limit: Number.POSITIVE_INFINITY,
    upload: true,
    reupload: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cache') options.cacheDir = argv[(i += 1)];
    else if (arg === '--level') options.level = argv[(i += 1)] as Options['level'];
    else if (arg === '--limit') options.limit = Number(argv[(i += 1)]);
    else if (arg === '--no-upload') options.upload = false;
    else if (arg === '--upload') options.upload = true;
    else if (arg === '--reupload') options.reupload = true;
    else throw new Error(`Unbekannte Option: ${arg}`);
  }
  return options;
}

/**
 * Gleichzeitige Uploads.
 *
 * Nacheinander übertragen kostet je Kachel eine volle Rundreise; bei 4.385
 * Kacheln ist das der Unterschied zwischen Minuten und einer Stunde.
 */
const UPLOAD_PARALLEL = 8;

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

/**
 * Ein roher Block aus dem Cache, oder `undefined`.
 *
 * Die Länge wird geprüft: ein Abbruch mitten im Schreiben hinterlässt eine
 * abgeschnittene Datei, und die läge sonst als stiller Datenfehler in der
 * Kachel — halbe Zeilen, verschobenes Gelände, kein Fehler nirgends. Eine
 * unbrauchbare Datei wird neu geladen statt gelesen.
 */
async function readRawBlock(
  file: string,
  pixels: number
): Promise<Float32Array | undefined> {
  if (!(await exists(file))) return undefined;
  const bytes = await readFile(file);
  if (bytes.byteLength !== pixels * 4) {
    console.warn(
      `${file}: ${bytes.byteLength} statt ${pixels * 4} Byte — wird verworfen`
    );
    return undefined;
  }
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
}

/** Rohhöhen eines Detailblocks, aus dem Cache oder frisch aus der Quelle. */
async function detailHeights(
  block: BlockRef,
  spec: LevelSpec,
  cacheDir: string
): Promise<Float32Array> {
  const file = rawPath(cacheDir, block);
  const cached = await readRawBlock(file, spec.blockPx * spec.blockPx);
  if (cached) return cached;

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
  // Über `.tmp` und `rename`: ein Abbruch mitten im Schreiben hinterließe
  // sonst eine halbe Datei, die beim nächsten Lauf als fertig gilt.
  await writeFile(`${file}.tmp`, Buffer.from(heights.buffer));
  await rename(`${file}.tmp`, file);
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
/**
 * Die Übersichtsstufe aus den rohen Detailblöcken.
 *
 * **Geschrieben wird nur ein vollständiger Block.** Ein Übersichtsblock deckt
 * 100 Detailblöcke ab; fehlt davon einer, der zum Land gehört, hätte die
 * Kachel ein Loch — und weil ein fertiger Block beim nächsten Lauf
 * übersprungen wird, bliebe das Loch für immer. Genau das passiert bei einem
 * Import in Etappen oder nach einem Abbruch.
 *
 * „Vollständig" heißt: alle Kinder, die überhaupt zum Land gehören. Blöcke
 * jenseits der Landesgrenze entstehen nie und dürfen einen Übersichtsblock
 * nicht dauerhaft verhindern.
 */
async function buildOverview(
  detailBlocks: BlockRef[],
  /** Alle Detailblöcke, die zum Land gehören — nicht nur die schon gebauten. */
  candidates: BlockRef[],
  cacheDir: string,
  limit: number
): Promise<BlockRef[]> {
  const detail = levelSpec('detail');
  const spec = levelSpec('overview');
  const size = blockSizeM(spec);
  const detailSize = blockSizeM(detail);
  const perSide = size / detailSize;

  const candidateIds = new Set(candidates.map(blockId));

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
  let incomplete = 0;
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
    let missing = 0;

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
        const heights = await readRawBlock(
          file,
          detail.blockPx * detail.blockPx
        );
        if (!heights) {
          // Nur ein Kind, das zum Land gehört, macht den Block unvollständig.
          if (candidateIds.has(blockId(child))) missing += 1;
          continue;
        }
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
    if (missing > 0) {
      // Später erneut, wenn die Detailstufe vollständig ist. Jetzt geschrieben
      // wäre der Block für immer löchrig.
      incomplete += 1;
      continue;
    }

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

  console.log(
    `overview: ${written.length} Kacheln geschrieben` +
      (incomplete > 0
        ? `, ${incomplete} zurückgestellt (Detailstufe noch unvollständig)`
        : '')
  );
  return written;
}

/**
 * Das Versatzgitter EVRF2000 → müA aus `npm run terrainCalibrate`.
 *
 * Ohne die Datei bricht der Import ab, statt einen Festwert zu erfinden: über
 * das Burgenland schwankt der Zuschlag um 13,9 cm, und ein geratener Skalar
 * würde im Wasserstandsmodell später als Messwert gelesen.
 */
async function readCalibration(cacheDir: string): Promise<AdriaOffsetGrid> {
  const file = path.join(cacheDir, 'terrain-calibration.json');
  try {
    return JSON.parse(await readFile(file, 'utf8')) as AdriaOffsetGrid;
  } catch {
    throw new Error(
      `${file} fehlt. Erst \`npm run terrainCalibrate\` laufen lassen — ` +
        'das Versatzgitter EVRF2000 → müA kommt aus dem amtlichen ' +
        'BEV-Höhen-Grid und wird nicht geraten.'
    );
  }
}

/**
 * Kacheln und Index in den Speicher.
 *
 * `levels` beschränkt die **Kacheln** auf die gewählte Stufe, der Index geht
 * immer vollständig hoch — er beschreibt ohnehin, was im Cache liegt. Damit
 * ist ein Rollout in Etappen möglich: erst die Übersichtsstufe hoch, damit die
 * Karte landesweit etwas zeigt, die Detailstufe danach.
 */
async function upload(
  cacheDir: string,
  index: TerrainIndex,
  levels: Options['level'],
  reupload: boolean
): Promise<void> {
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
  const bucketName = `${projectId}.appspot.com`;

  // Gegenprobe gegen die Client-Konfiguration, wenn sie in der Umgebung
  // liegt: Der Client bildet den Bucket aus `NEXT_PUBLIC_FIREBASE_APIKEY`
  // (siehe `terrainBucket`). Ein Upload in einen anderen Bucket fällt sonst
  // erst nach Stunden auf — und dann als 404 auf jeder Kachel.
  const clientBucket = terrainBucket();
  if (clientBucket && clientBucket !== bucketName) {
    throw new Error(
      `Bucket ${bucketName} (aus Projekt ${projectId}), der Client liest aber ` +
        `${clientBucket} aus NEXT_PUBLIC_FIREBASE_APIKEY. Einer von beiden ist falsch.`
    );
  }

  const bucket = getStorage().bucket(bucketName);

  for (const level of index.levels) {
    if (levels !== 'all' && level.id !== levels) {
      console.log(`upload: Stufe ${level.id} übersprungen (--level ${levels})`);
      continue;
    }
    // Bewusst über `pathTemplate` der Stufe und nicht selbst gebaut: der
    // Client liest denselben Wert aus dem Index. Zwei Formeln würden erst
    // nach dem Rollout auffallen, und dann als 404 auf jeder Kachel.
    const destinationOf = (block: string): string => {
      const ref = parseBlockId(block);
      if (!ref) throw new Error(`Unlesbarer Blockname: ${block}`);
      return terrainBlockPath(level, ref);
    };

    // Einmal auflisten statt je Kachel nachfragen: 4.385 Einzelabfragen
    // kosteten mehr als der Upload selbst.
    const prefix = `${TERRAIN_PREFIX}/${level.pathTemplate.split('/')[0]}/`;
    const [remoteFiles] = await bucket.getFiles({ prefix });
    const remote = new Set(remoteFiles.map((file) => file.name));

    const plan = blocksToUpload(
      await blocksOf(cacheDir, level.id),
      remote,
      destinationOf,
      reupload
    );
    if (plan.skipped > 0) {
      console.log(
        `upload: Stufe ${level.id} — ${plan.skipped} Kacheln liegen schon im Speicher`
      );
    }

    let done = 0;
    await runPooled(plan.upload, UPLOAD_PARALLEL, async (block) => {
      await bucket.upload(path.join(cacheDir, 'out', level.id, `${block}.png`), {
        destination: destinationOf(block),
        metadata: {
          contentType: 'image/png',
          // Der Pfad ist versioniert, die Inhalte sind damit unveränderlich.
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
      done += 1;
      if (done % 100 === 0) {
        console.log(`upload: ${level.id} ${done}/${plan.upload.length}`);
      }
    });
    console.log(
      `upload: Stufe ${level.id} übertragen (${plan.upload.length} Kacheln)`
    );
  }

  await bucket.file(TERRAIN_INDEX_PATH).save(
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

  // Das Ergebnis wird nicht weiterverwendet: der Index liest aus dem
  // Verzeichnis. `buildOverview` meldet selbst, wie viele Kacheln entstanden
  // sind.
  if (options.level !== 'detail') {
    await buildOverview(
      detailBlocks,
      candidates,
      options.cacheDir,
      options.limit
    );
  }

  // Aus dem Ausgabeverzeichnis, nicht aus `detailBlocks`/`overviewBlocks`:
  // der Index muss beschreiben, was vorliegt, nicht was dieser Lauf gebaut
  // hat. Siehe `buildIndex`.
  const index = buildIndex(
    { detail: detailBounds, overview: overviewBounds },
    {
      detail: await blocksOf(options.cacheDir, 'detail'),
      overview: await blocksOf(options.cacheDir, 'overview'),
    },
    await readCalibration(options.cacheDir),
    new Date().toISOString()
  );

  const indexFile = path.join(options.cacheDir, 'out', 'index.json');
  await mkdir(path.dirname(indexFile), { recursive: true });
  await writeFile(indexFile, JSON.stringify(index, null, 2));
  console.log(`index.json geschrieben: ${indexFile}`);

  if (options.upload) {
    await upload(options.cacheDir, index, options.level, options.reupload);
  }
  else console.log('Upload übersprungen (--no-upload)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
