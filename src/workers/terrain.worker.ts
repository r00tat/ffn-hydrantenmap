import { BlockStore } from '../common/terrain/blockStore';
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
        lines: await terrainContours(
          store,
          request.bounds,
          request.equidistanceM
        ),
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
