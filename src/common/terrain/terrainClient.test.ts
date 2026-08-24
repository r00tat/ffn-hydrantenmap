import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTerrainClient,
  type TerrainWorkerLike,
} from './terrainClient';
import type { TerrainRequest, TerrainResponse } from './terrainTypes';

/** Ein Worker, der nichts von selbst tut — der Test antwortet. */
function fakeWorker() {
  const sent: TerrainRequest[] = [];
  const worker: TerrainWorkerLike = {
    postMessage: (request) => {
      sent.push(request);
    },
    onmessage: null,
    onerror: null,
  };
  return {
    worker,
    sent,
    reply: (response: TerrainResponse) => worker.onmessage?.({ data: response }),
    fail: (message: string) => worker.onerror?.({ message }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createTerrainClient', () => {
  it('gibt die Höhen der Antwort zurück', async () => {
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);

    const promise = client.sample([[47.9, 16.8]]);
    expect(fake.sent[0]).toMatchObject({ op: 'sample', id: 1 });

    fake.reply({
      id: 1,
      ok: true,
      op: 'sample',
      samples: [{ heightM: 132.4, level: 'detail' }],
    });
    await expect(promise).resolves.toEqual([
      { heightM: 132.4, level: 'detail' },
    ]);
  });

  it('ordnet Antworten auch in vertauschter Reihenfolge zu', async () => {
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);

    const first = client.sample([[47.9, 16.8]]);
    const second = client.contours(
      { south: 47.9, west: 16.8, north: 47.91, east: 16.81 },
      5
    );

    // Die zweite Anfrage antwortet zuerst.
    fake.reply({
      id: 2,
      ok: true,
      op: 'contours',
      lines: [{ heightM: 130, points: [[47.9, 16.8]], closed: false }],
    });
    fake.reply({ id: 1, ok: true, op: 'sample', samples: [null] });

    await expect(second).resolves.toEqual({
      lines: [{ heightM: 130, points: [[47.9, 16.8]], closed: false }],
      level: undefined,
      resolutionM: undefined,
    });
    await expect(first).resolves.toEqual([null]);
  });

  it('gibt die Fehlermeldung des Workers weiter', async () => {
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);
    const promise = client.sample([[47.9, 16.8]]);
    fake.reply({ id: 1, ok: false, error: 'Kachel unlesbar' });
    await expect(promise).rejects.toThrow('Kachel unlesbar');
  });

  it('weist eine Antwort mit falscher Operation ab', async () => {
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);
    const promise = client.sample([[47.9, 16.8]]);
    fake.reply({ id: 1, ok: true, op: 'contours', lines: [] });
    await expect(promise).rejects.toThrow(/unerwartete Antwort/);
  });

  it('bricht eine Anfrage ohne Antwort ab', async () => {
    vi.useFakeTimers();
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);
    const promise = client.sample([[47.9, 16.8]]);
    const assertion = expect(promise).rejects.toThrow(/ohne Antwort/);
    await vi.advanceTimersByTimeAsync(20_001);
    await assertion;
  });

  it('gibt dem Vorwärmen mehr Zeit, je mehr Kacheln es sind', async () => {
    vi.useFakeTimers();
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);
    const blockIds = Array.from({ length: 100 }, (_, i) => `block-${i}`);
    const promise = client.prefetch('detail', blockIds);

    // Nach dem normalen Zeitlimit muss das Vorwärmen noch laufen: 100 Kacheln
    // ergeben 200 s, nicht 20 s.
    let settled = false;
    void promise.then(
      () => (settled = true),
      () => (settled = true)
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);

    fake.reply({ id: 1, ok: true, op: 'prefetch', loaded: 98, failed: 2 });
    await expect(promise).resolves.toEqual({ loaded: 98, failed: 2 });
  });

  it('lässt alle offenen Anfragen scheitern, wenn der Worker stirbt', async () => {
    const fake = fakeWorker();
    const client = createTerrainClient(fake.worker);
    const first = client.sample([[47.9, 16.8]]);
    const second = client.sample([[47.8, 16.7]]);

    fake.fail('script error');

    await expect(first).rejects.toThrow(/script error/);
    await expect(second).rejects.toThrow(/script error/);
  });
});
