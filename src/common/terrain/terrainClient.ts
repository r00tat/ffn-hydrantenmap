import type { LatLngPosition } from '../geo';
import type { TerrainLevelId } from './terrainIndexTypes';
import type {
  ContourResult,
  FloodProgress,
  FloodSummary,
  TerrainBoundsLatLng,
  TerrainMesh,
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

/**
 * Zeit **ohne Fortschritt**, nach der ein Flutlauf als verloren gilt.
 *
 * Ein Gesamtlimit ginge hier nicht: ein Detaillauf über 120 Blöcke dauert
 * Minuten, und jedes feste Limit wäre entweder zu kurz oder so lang, dass ein
 * echter Aussetzer nicht mehr auffällt.
 */
const FLOOD_IDLE_TIMEOUT_MS = 30_000;

export interface FloodOptions {
  /** Umkreis um den Saatpunkt in m; 0 oder fehlend heißt unbegrenzt. */
  maxRadiusM?: number;
  onProgress?: (progress: FloodProgress) => void;
}

export interface FloodHandle {
  result: Promise<FloodSummary>;
  /** Bricht den Lauf ab; `result` wird mit `aborted` abgelehnt. */
  abort(): void;
}

export interface TerrainClient {
  sample(positions: LatLngPosition[]): Promise<(TerrainSample | null)[]>;
  contours(
    bounds: TerrainBoundsLatLng,
    equidistanceM: number
  ): Promise<ContourResult>;
  /**
   * Das Geländenetz für die 3D-Ansicht.
   *
   * `undefined`, wenn für den Ausschnitt keine Stufe ins Zellbudget passt oder
   * kein einziger Block vorliegt — die Ansicht sagt das an, statt schwarz zu
   * bleiben.
   */
  mesh(
    bounds: TerrainBoundsLatLng,
    maxVertices?: number
  ): Promise<TerrainMesh | undefined>;
  prefetch(
    levelId: TerrainLevelId,
    blockIds: string[]
  ): Promise<{ loaded: number; failed: number }>;
  /** Die Namen aller vorhandenen Blöcke einer Stufe. */
  blocks(levelId: TerrainLevelId): Promise<string[]>;
  flood(
    seed: LatLngPosition,
    heightM: number,
    levelId: TerrainLevelId,
    options?: FloodOptions
  ): FloodHandle;
  /** Zuschlag EVRF2000 → müA, `null` außerhalb des Gitters. */
  adria(positions: LatLngPosition[]): Promise<(number | null)[]>;
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
  /** Frist, auf die der Zeitgeber bei Fortschritt neu gesetzt wird. */
  timeoutMs: number;
  op: string;
  onProgress?: (progress: FloodProgress) => void;
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

export function createTerrainClient(
  worker: TerrainWorkerLike,
  /**
   * Wird gerufen, wenn der Worker stirbt.
   *
   * `terrainClient()` verwirft daraufhin seine Instanz, damit die nächste
   * Abfrage einen frischen Worker bekommt. Ohne das bleibt ein einmal
   * gestorbener Worker für die ganze Sitzung stehen und jede weitere Anfrage
   * läuft ins Zeitlimit — 20 s je Neuzeichnung der Karte, ohne dass sich
   * irgendetwas erholen könnte.
   */
  onWorkerError?: () => void
): TerrainClient {
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (event: { data: TerrainResponse }): void => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;

    // Fortschritt beantwortet die Anfrage nicht — er verlängert sie.
    if (response.ok && response.op === 'floodProgress') {
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        pending.delete(response.id);
        entry.reject(
          new Error(
            `Höhenmodell: ${entry.op} ohne Fortschritt nach ${entry.timeoutMs} ms`
          )
        );
      }, entry.timeoutMs);
      const { phase, blocks, cells, total } = response;
      entry.onProgress?.({ phase, blocks, cells, total });
      return;
    }

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
    onWorkerError?.();
  };

  const send = (
    request: TerrainRequestBody,
    timeoutMs: number,
    onProgress?: (progress: FloodProgress) => void
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
      pending.set(id, {
        resolve,
        reject,
        timer,
        timeoutMs,
        op: full.op,
        onProgress,
      });
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
        minM: response.minM,
        maxM: response.maxM,
      };
    },

    async mesh(bounds, maxVertices) {
      const response = await send(
        { op: 'mesh', bounds, maxVertices },
        REQUEST_TIMEOUT_MS
      );
      if (!response.ok || response.op !== 'mesh') throw unexpected(response);
      return response.mesh;
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

    flood(seed, heightM, levelId, options) {
      // Die Nummer, die `send` als nächste vergibt. Der Abbruch muss sie
      // kennen, bevor die Antwort da ist — deshalb hier gelesen und nicht
      // aus dem Ergebnis genommen.
      const id = nextId;
      const result = send(
        {
          op: 'flood',
          seed,
          heightM,
          level: levelId,
          maxRadiusM: options?.maxRadiusM,
        },
        FLOOD_IDLE_TIMEOUT_MS,
        options?.onProgress
      ).then((response) => {
        if (!response.ok || response.op !== 'flood') throw unexpected(response);
        return response.result;
      });
      return {
        result,
        abort: () => {
          void send({ op: 'floodAbort', target: id }, REQUEST_TIMEOUT_MS).catch(
            () => undefined
          );
        },
      };
    },

    async adria(positions) {
      const response = await send(
        { op: 'adria', positions },
        REQUEST_TIMEOUT_MS
      );
      if (!response.ok || response.op !== 'adria') throw unexpected(response);
      return response.offsets;
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
  //
  // Stirbt der Worker, wird die Instanz verworfen: die nächste Abfrage baut
  // einen neuen. Die Karte fragt bei jedem Verschieben neu an, ein einmaliger
  // Aussetzer heilt damit von selbst — vorher blieb die tote Instanz stehen
  // und jede weitere Abfrage lief 20 s ins Leere.
  instance ??= createTerrainClient(
    new Worker(
      new URL('../../workers/terrain.worker.ts', import.meta.url)
    ) as unknown as TerrainWorkerLike,
    () => {
      instance = undefined;
    }
  );
  return instance;
}
