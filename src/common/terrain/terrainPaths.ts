import type { TerrainLevel } from './terrainIndexTypes';

/**
 * Version und Pfade des ausgelieferten Höhenmodells.
 *
 * Liegt in `common`, weil sowohl der Import (Upload) als auch der Client
 * (Abruf) dieselben Pfade bilden müssen. Zwei Quellen dafür würden erst beim
 * Rollout auffallen, und dann als 404 auf jeder Kachel.
 */

export const TERRAIN_VERSION = 1;
export const TERRAIN_PREFIX = `terrain/v${TERRAIN_VERSION}`;
export const TERRAIN_INDEX_PATH = `${TERRAIN_PREFIX}/index.json`;

/** Pfad einer Kachel innerhalb des Prefixes, aus `pathTemplate` der Stufe. */
export const terrainBlockPath = (
  level: Pick<TerrainLevel, 'pathTemplate'>,
  block: { e: number; n: number }
): string =>
  `${TERRAIN_PREFIX}/${level.pathTemplate
    .replace('{n}', String(block.n))
    .replace('{e}', String(block.e))}`;

/**
 * Download-URL eines Objekts im Firebase-Storage-Bucket.
 *
 * Bewusst die REST-URL und nicht `getDownloadURL()` aus dem Firebase-SDK: die
 * Kacheln sind ohne Token öffentlich lesbar (siehe `storage.rules`), und
 * `getDownloadURL` würde je Kachel einen zusätzlichen Roundtrip kosten — bei
 * tausenden Kacheln und offline gar nicht erst möglich.
 *
 * Der Pfad muss `/o/terrain%2F…` ergeben: darauf greift die Cache-Regel des
 * Service Workers zu (`src/worker/patterns.ts`).
 */
export const terrainObjectUrl = (bucket: string, path: string): string =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
    path
  )}?alt=media`;

/**
 * Der Bucket aus der öffentlichen Firebase-Konfiguration.
 *
 * `NEXT_PUBLIC_FIREBASE_APIKEY` trägt die komplette Client-Konfiguration als
 * JSON; Turbopack setzt sie zur Bauzeit ein, also auch im Worker-Chunk.
 */
export function terrainBucket(): string | undefined {
  try {
    const config = JSON.parse(
      process.env.NEXT_PUBLIC_FIREBASE_APIKEY || '{}'
    ) as { storageBucket?: string };
    return config.storageBucket;
  } catch {
    return undefined;
  }
}
