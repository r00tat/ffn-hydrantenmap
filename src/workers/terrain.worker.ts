import { adriaOffsetLookup } from '../common/terrain/adriaOffset';
import { availableBlocks } from '../common/terrain/availability';
import { BlockStore } from '../common/terrain/blockStore';
import { floodBands } from '../common/terrain/floodBands';
import { FloodAborted, floodFill } from '../common/terrain/floodFill';
import { blockId } from '../common/terrain/grid';
import { terrainLevel } from '../common/terrain/terrainIndexTypes';
import { terrainContours } from '../common/terrain/terrainContours';
import { sampleTerrain } from '../common/terrain/terrainSample';
import type {
  TerrainRequest,
  TerrainResponse,
} from '../common/terrain/terrainTypes';

/**
 * Der Worker des Höhenmodells.
 *
 * Höhenlinien über einen Kartenausschnitt sind Millionen Zellen Arbeit; im
 * Hauptthread gerechnet würde die Karte für Sekunden stehen. Der Worker hält
 * außerdem den einzigen Blockcache — dekodierte Blöcke sind 4 MB, und zwei
 * Instanzen davon wären zwei Kopien derselben Kacheln.
 */

const store = new BlockStore();

const post = (response: TerrainResponse): void => {
  (self as unknown as Worker).postMessage(response);
};

/**
 * Anfragenummern, deren Lauf abgebrochen werden soll.
 *
 * Ein Set und kein einzelner Wert: zwei Läufe gleichzeitig sind selten, aber
 * ein Abbruch, der den falschen trifft, wäre nicht zu erklären.
 */
const aborted = new Set<number>();

async function handle(request: TerrainRequest): Promise<void> {
  switch (request.op) {
    case 'sample':
      post({
        id: request.id,
        ok: true,
        op: 'sample',
        samples: await sampleTerrain(store, request.positions),
      });
      return;
    case 'contours':
      post({
        id: request.id,
        ok: true,
        op: 'contours',
        ...(await terrainContours(store, request.bounds, request.equidistanceM)),
      });
      return;
    case 'prefetch': {
      const { loaded, failed } = await store.warm(
        request.level,
        request.blockIds
      );
      post({ id: request.id, ok: true, op: 'prefetch', loaded, failed });
      return;
    }
    case 'blocks': {
      const index = await store.index();
      const level = index ? terrainLevel(index, request.level) : undefined;
      post({
        id: request.id,
        ok: true,
        op: 'blocks',
        blockIds: level ? availableBlocks(level).map(blockId) : [],
      });
      return;
    }
    case 'floodAbort':
      aborted.add(request.target);
      post({ id: request.id, ok: true, op: 'floodAbort' });
      return;
    case 'adria': {
      const index = await store.index();
      if (!index) {
        post({
          id: request.id,
          ok: true,
          op: 'adria',
          offsets: request.positions.map(() => null),
        });
        return;
      }
      const lookup = adriaOffsetLookup(index.adriaOffset);
      post({
        id: request.id,
        ok: true,
        op: 'adria',
        offsets: request.positions.map(
          (position) => lookup.offsetAt(position) ?? null
        ),
      });
      return;
    }
    case 'flood': {
      const abort = () => aborted.has(request.id);
      try {
        const fill = await floodFill(
          store,
          request.seed,
          request.heightM,
          request.level,
          {
            abort,
            onProgress: ({ blocks, cells }) =>
              post({
                id: request.id,
                ok: true,
                op: 'floodProgress',
                phase: 'fill',
                blocks,
                cells,
              }),
          }
        );
        const bands = await floodBands(store, fill, request.heightM, {
          abort,
          onProgress: ({ blocks, total }) =>
            post({
              id: request.id,
              ok: true,
              op: 'floodProgress',
              phase: 'bands',
              blocks,
              cells: fill.cells,
              total,
            }),
        });
        post({
          id: request.id,
          ok: true,
          op: 'flood',
          result: {
            levelId: fill.levelId,
            resolutionM: fill.resolutionM,
            baender: bands.baender,
            toleranzM: bands.toleranzM,
            inselnVerworfen: bands.inselnVerworfen,
            punkte: bands.punkte,
            cells: fill.cells,
            areaM2: fill.areaM2,
            maxDepthM: fill.maxDepthM,
            longestAxisM: fill.longestAxisM,
            truncated: fill.truncated,
            missingBlocks: fill.missingBlocks,
            edgeBlocks: fill.edgeBlocks,
            reason: fill.reason,
          },
        });
      } catch (error) {
        if (error instanceof FloodAborted) {
          post({ id: request.id, ok: false, error: 'aborted' });
          return;
        }
        throw error;
      } finally {
        aborted.delete(request.id);
      }
      return;
    }
  }
}

self.onmessage = (event: MessageEvent<TerrainRequest>): void => {
  const request = event.data;
  // Jeder Fehler wird beantwortet, nicht geworfen: eine unbeantwortete Anfrage
  // hängt im Client bis ins Zeitlimit und der Layer bleibt leer, ohne dass
  // irgendwo etwas davon steht.
  void handle(request).catch((error: unknown) => {
    post({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};
