import type { LatLngPosition } from '../geo';
import type { TerrainLevelId } from './terrainIndexTypes';
import type {
  ContourResult,
  TerrainBoundsLatLng,
  TerrainRequest,
  TerrainResponse,
  TerrainSample,
} from './terrainTypes';

/**
 * Zugang zum Höhenmodell-Worker.
 *
 * Ein Singleton: der Worker hält den Blockcache, und ein zweiter Worker hielte
 * eine zweite Kopie derselben Kacheln — bei 4 MB je Detailblock der Unterschied
 * zwischen flüssig und nicht.
 */

/**
 * Zeitlimit einer Abfrage.
 *
 * Ohne Limit bleibt eine Anfrage, deren Antwort verloren geht, für immer offen,
 * und der Layer zeigt dauerhaft „lädt". 20 s sind reichlich für Höhenlinien
 * über einen Bildschirm samt Nachladen der Kacheln.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Das Vorwärmen des Offline-Pakets dauert nach Zahl der Kacheln, nicht nach
 * einer festen Frist: bei tausenden Kacheln wäre jedes feste Limit entweder zu
 * kurz oder sinnlos lang.
 */
const PREFETCH_TIMEOUT_PER_BLOCK_MS = 2_000;
const PREFETCH_TIMEOUT_MIN_MS = 60_000;

export interface TerrainClient {
  sample(positions: LatLngPosition[]): Promise<(TerrainSample | null)[]>;
  contours(
    bounds: TerrainBoundsLatLng,
    equidistanceM: number
  ): Promise<ContourResult>;
  prefetch(
    levelId: TerrainLevelId,
    blockIds: string[]
  ): Promise<{ loaded: number; failed: number }>;
  /** Die Namen aller vorhandenen Blöcke einer Stufe. */
  blocks(levelId: TerrainLevelId): Promise<string[]>;
}

/**
 * Die Anfrage ohne ihre Nummer.
 *
 * Bedingt formuliert, damit `Omit` sich über die Union **verteilt**: ein
 * direktes `Omit<TerrainRequest, 'id'>` behielte nur die gemeinsamen Felder
 * und ließe `positions`, `bounds` und `level` fallen.
 */
type TerrainRequestBody =
  TerrainRequest extends infer Variant
    ? Variant extends { id: number }
      ? Omit<Variant, 'id'>
      : never
    : never;

interface Pending {
  resolve: (response: TerrainResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Die Teile eines `Worker`, die hier gebraucht werden.
 *
 * Damit ist der Nachrichtenverkehr — Zuordnung von Antwort zu Anfrage,
 * Zeitlimit, Weitergabe von Fehlern — ohne echten Worker prüfbar.
 */
export interface TerrainWorkerLike {
  postMessage(request: TerrainRequest): void;
  onmessage: ((event: { data: TerrainResponse }) => void) | null;
  onerror: ((event: { message: string }) => void) | null;
}

export function createTerrainClient(worker: TerrainWorkerLike): TerrainClient {
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (event: { data: TerrainResponse }): void => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    clearTimeout(entry.timer);
    if (response.ok) entry.resolve(response);
    else entry.reject(new Error(response.error));
  };

  worker.onerror = (event: { message: string }): void => {
    // Der Worker ist gestorben. Alle offenen Anfragen scheitern sofort, statt
    // einzeln ins Zeitlimit zu laufen.
    const error = new Error(
      `Höhenmodell-Worker abgebrochen: ${event.message || 'unbekannter Fehler'}`
    );
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };

  const send = (
    request: TerrainRequestBody,
    timeoutMs: number
  ): Promise<TerrainResponse> => {
    const id = nextId;
    nextId += 1;
    const full = { ...request, id } as TerrainRequest;
    return new Promise<TerrainResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `Höhenmodell: ${full.op} ohne Antwort nach ${timeoutMs} ms`
          )
        );
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage(full);
    });
  };

  const unexpected = (response: TerrainResponse): Error =>
    new Error(
      `Höhenmodell: unerwartete Antwort ${JSON.stringify(response).slice(0, 120)}`
    );

  return {
    async sample(positions) {
      const response = await send({ op: 'sample', positions }, REQUEST_TIMEOUT_MS);
      if (!response.ok || response.op !== 'sample') throw unexpected(response);
      return response.samples;
    },

    async contours(bounds, equidistanceM) {
      const response = await send(
        { op: 'contours', bounds, equidistanceM },
        REQUEST_TIMEOUT_MS
      );
      if (!response.ok || response.op !== 'contours') throw unexpected(response);
      return {
        lines: response.lines,
        level: response.level,
        resolutionM: response.resolutionM,
      };
    },

    async prefetch(levelId, blockIds) {
      const response = await send(
        { op: 'prefetch', level: levelId, blockIds },
        Math.max(
          PREFETCH_TIMEOUT_MIN_MS,
          blockIds.length * PREFETCH_TIMEOUT_PER_BLOCK_MS
        )
      );
      if (!response.ok || response.op !== 'prefetch') throw unexpected(response);
      return { loaded: response.loaded, failed: response.failed };
    },

    async blocks(levelId) {
      const response = await send(
        { op: 'blocks', level: levelId },
        REQUEST_TIMEOUT_MS
      );
      if (!response.ok || response.op !== 'blocks') throw unexpected(response);
      return response.blockIds;
    },
  };
}

let instance: TerrainClient | undefined;

/**
 * Der Worker, beim ersten Aufruf erzeugt.
 *
 * Auf dem Server wirft der Aufruf. Ein versehentlicher Import in eine
 * Server-Komponente soll auffallen, nicht still ohne Höhen weiterlaufen.
 */
export function terrainClient(): TerrainClient {
  if (typeof Worker === 'undefined') {
    throw new Error(
      'terrainClient() braucht einen Browser — in Server-Komponenten nicht verwendbar'
    );
  }
  // Einzige Stelle mit einem Cast: `Worker` trägt `onmessage` mit
  // `MessageEvent<any>`, hier wird nur darauf geschrieben.
  instance ??= createTerrainClient(
    new Worker(
      new URL('../../workers/terrain.worker.ts', import.meta.url)
    ) as unknown as TerrainWorkerLike
  );
  return instance;
}
