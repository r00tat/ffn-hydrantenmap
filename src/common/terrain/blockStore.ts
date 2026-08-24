import {
  decodeAvailability,
  hasBlock,
  type AvailabilityLookup,
} from './availability';
import { rgbaToEncodedBlock } from './encoding';
import { blockForPoint, blockId, parseBlockId, type BlockRef } from './grid';
import type { LaeaPoint } from './projection';
import {
  TERRAIN_LEVEL_ORDER,
  terrainLevel,
  type TerrainIndex,
  type TerrainLevel,
  type TerrainLevelId,
} from './terrainIndexTypes';
import {
  TERRAIN_INDEX_PATH,
  terrainBlockPath,
  terrainBucket,
  terrainObjectUrl,
} from './terrainPaths';

/**
 * Der Blockcache.
 *
 * Läuft im Worker und ist der einzige Besitzer der Höhendaten — Höhenabfrage,
 * Höhenlinien und später der Flood-Fill greifen alle hierauf zu, statt je
 * eigene Kopien derselben Blöcke zu halten.
 *
 * Gehalten werden die **kodierten** Werte als `Uint32Array`: genauso groß wie
 * `Float32Array`, aber ohne Umrechnung beim Laden, und `nodata` bleibt ein
 * eigener Wert statt `NaN` — ein `NaN`, das irgendwo zu 0 wird, setzt im
 * Wasserstandsmodell ein halbes Bundesland unter Wasser.
 */

export interface TerrainBlock {
  /** Kodierte Werte, Zeilen von Nord nach Süd. */
  heights: Uint32Array;
  sizePx: number;
  level: TerrainLevel;
  block: BlockRef;
}

/**
 * Zwölf Detailblöcke sind 48 MB — genug für einen Bildschirm samt Rand, und
 * wenig genug, dass ein Tablet nicht ins Schwitzen kommt.
 */
export const MAX_CACHED_BLOCKS = 12;

/**
 * Wie lange ein Fehlschlag gilt.
 *
 * Ohne diese Sperre läuft jeder Layer-Redraw in dieselbe fehlschlagende
 * Anfrage — bei ausgefallenem Netz einmal je Block und Neuzeichnung.
 */
export const RETRY_AFTER_MS = 60_000;

/** Gleichzeitige Anfragen beim Vorwärmen des Offline-Pakets. */
const WARM_PARALLEL = 6;

export interface DecodedImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export type TerrainFetch = (url: string) => Promise<Response>;
export type TerrainDecoder = (blob: Blob) => Promise<DecodedImage>;

/**
 * PNG → RGBA.
 *
 * `colorSpaceConversion: 'none'` ist **nicht** optional: ohne das Flag darf
 * der Browser Farbmanagement anwenden, und dann sind die Höhen verschoben,
 * ohne dass das Bild falsch aussieht.
 */
export async function decodeTerrainImage(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('OffscreenCanvas ohne 2d-Kontext');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: image.data, width: image.width, height: image.height };
  } finally {
    bitmap.close();
  }
}

export interface BlockStoreOptions {
  bucket?: string;
  fetch?: TerrainFetch;
  decode?: TerrainDecoder;
  maxBlocks?: number;
}

export class BlockStore {
  private readonly bucket?: string;
  private readonly fetchImpl: TerrainFetch;
  private readonly decode: TerrainDecoder;
  private readonly maxBlocks: number;

  private indexValue?: TerrainIndex;
  private indexPromise?: Promise<TerrainIndex | undefined>;
  private indexFailedAt?: number;

  private readonly lookups = new Map<TerrainLevelId, AvailabilityLookup>();
  /** Einfügereihenfolge = LRU-Reihenfolge. */
  private readonly blocks = new Map<string, TerrainBlock>();
  private readonly inflight = new Map<
    string,
    Promise<TerrainBlock | undefined>
  >();
  private readonly failedAt = new Map<string, number>();

  constructor(options: BlockStoreOptions = {}) {
    this.bucket = options.bucket ?? terrainBucket();
    this.fetchImpl = options.fetch ?? ((url) => fetch(url));
    this.decode = options.decode ?? decodeTerrainImage;
    this.maxBlocks = options.maxBlocks ?? MAX_CACHED_BLOCKS;
  }

  /**
   * Der Kachel-Index, einmal geladen und danach gehalten.
   *
   * Scheitert er, ergeben alle Abfragen `undefined` und der nächste Versuch
   * folgt erst nach `RETRY_AFTER_MS` — sonst hängt jeder Layer-Redraw an einer
   * fehlschlagenden Anfrage.
   */
  async index(): Promise<TerrainIndex | undefined> {
    if (this.indexValue) return this.indexValue;
    if (this.indexPromise) return this.indexPromise;
    if (
      this.indexFailedAt !== undefined &&
      Date.now() - this.indexFailedAt < RETRY_AFTER_MS
    ) {
      return undefined;
    }
    this.indexPromise = this.loadIndex().finally(() => {
      this.indexPromise = undefined;
    });
    return this.indexPromise;
  }

  private async loadIndex(): Promise<TerrainIndex | undefined> {
    if (!this.bucket) {
      this.indexFailedAt = Date.now();
      return undefined;
    }
    try {
      const response = await this.fetchImpl(
        terrainObjectUrl(this.bucket, TERRAIN_INDEX_PATH)
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.indexValue = (await response.json()) as TerrainIndex;
      this.indexFailedAt = undefined;
      return this.indexValue;
    } catch {
      this.indexFailedAt = Date.now();
      return undefined;
    }
  }

  private lookupFor(level: TerrainLevel): AvailabilityLookup {
    const known = this.lookups.get(level.id);
    if (known) return known;
    const lookup = decodeAvailability(level.availability);
    this.lookups.set(level.id, lookup);
    return lookup;
  }

  async block(
    levelId: TerrainLevelId,
    block: BlockRef
  ): Promise<TerrainBlock | undefined> {
    const index = await this.index();
    if (!index) return undefined;
    const level = terrainLevel(index, levelId);
    return level ? this.blockOfLevel(level, block) : undefined;
  }

  /** Die feinste Stufe, für die ein Block zu diesem Punkt vorliegt. */
  async bestBlockFor(point: LaeaPoint): Promise<TerrainBlock | undefined> {
    const index = await this.index();
    if (!index) return undefined;
    for (const levelId of TERRAIN_LEVEL_ORDER) {
      const level = terrainLevel(index, levelId);
      if (!level) continue;
      const found = await this.blockOfLevel(
        level,
        blockForPoint(point, level.blockSizeM)
      );
      if (found) return found;
    }
    return undefined;
  }

  private blockOfLevel(
    level: TerrainLevel,
    block: BlockRef
  ): Promise<TerrainBlock | undefined> {
    const key = `${level.id}/${blockId(block)}`;

    const cached = this.blocks.get(key);
    if (cached) {
      // Treffer nach hinten: `Map` behält die Einfügereihenfolge.
      this.blocks.delete(key);
      this.blocks.set(key, cached);
      return Promise.resolve(cached);
    }

    const failed = this.failedAt.get(key);
    if (failed !== undefined) {
      if (Date.now() - failed < RETRY_AFTER_MS) return Promise.resolve(undefined);
      this.failedAt.delete(key);
    }

    // Verfügbarkeit vor dem Fetch: kein 404-Roundtrip für Blöcke jenseits der
    // Landesgrenze — und offline ist ein 404 nicht von „nicht im Cache" zu
    // unterscheiden.
    if (!hasBlock(level, this.lookupFor(level), block)) {
      return Promise.resolve(undefined);
    }

    const running = this.inflight.get(key);
    if (running) return running;

    const promise = this.loadBlock(level, block, key).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private async loadBlock(
    level: TerrainLevel,
    block: BlockRef,
    key: string
  ): Promise<TerrainBlock | undefined> {
    if (!this.bucket) return undefined;
    const url = terrainObjectUrl(this.bucket, terrainBlockPath(level, block));

    // Zwei Versuche: ein einzelner Netzaussetzer soll den Block nicht für eine
    // Minute sperren, eine echte Störung aber schon.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const image = await this.decode(await response.blob());
        if (image.width !== level.blockPx || image.height !== level.blockPx) {
          throw new Error(
            `${blockId(block)}: ${image.width}×${image.height} statt ` +
              `${level.blockPx}×${level.blockPx}`
          );
        }
        const loaded: TerrainBlock = {
          heights: rgbaToEncodedBlock(image.data, image.width * image.height),
          sizePx: image.width,
          level,
          block,
        };
        this.remember(key, loaded);
        return loaded;
      } catch {
        // Nächster Versuch, danach die Sperre unten.
      }
    }
    this.failedAt.set(key, Date.now());
    return undefined;
  }

  private remember(key: string, value: TerrainBlock): void {
    this.blocks.set(key, value);
    while (this.blocks.size > this.maxBlocks) {
      const oldest = this.blocks.keys().next().value;
      if (oldest === undefined) break;
      this.blocks.delete(oldest);
    }
  }

  /**
   * Kacheln in den HTTP-Cache holen, ohne sie zu dekodieren.
   *
   * Für das Offline-Paket zählt allein, dass der Service Worker die Antwort
   * hat. Dekodiert wird erst bei der Abfrage — hier zu dekodieren würde 4 MB
   * je Block kosten und den LRU-Cache mit Blöcken füllen, die niemand fragt.
   */
  async warm(
    levelId: TerrainLevelId,
    blockIds: string[]
  ): Promise<{ loaded: number; failed: number }> {
    const index = await this.index();
    const level = index ? terrainLevel(index, levelId) : undefined;
    if (!level || !this.bucket) {
      return { loaded: 0, failed: blockIds.length };
    }
    const bucket = this.bucket;
    const lookup = this.lookupFor(level);

    let loaded = 0;
    let failed = 0;
    let next = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const at = next;
        next += 1;
        if (at >= blockIds.length) return;
        const ref = parseBlockId(blockIds[at]);
        if (!ref || !hasBlock(level, lookup, ref)) {
          failed += 1;
          continue;
        }
        try {
          const response = await this.fetchImpl(
            terrainObjectUrl(bucket, terrainBlockPath(level, ref))
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          // Der Körper muss gelesen werden, sonst legt der Service Worker
          // die Antwort nicht ab.
          await response.blob();
          loaded += 1;
        } catch {
          failed += 1;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(WARM_PARALLEL, blockIds.length) }, worker)
    );
    return { loaded, failed };
  }
}
