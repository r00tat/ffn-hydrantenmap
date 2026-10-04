import { beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({ value: false }));
vi.mock('../../lib/connectivity', () => ({
  isOffline: () => offline.value,
  onReconnect: () => () => {},
  checkConnectivityNow: async () => !offline.value,
}));

const syncMock = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({ deltas: 1 })),
);
vi.mock('./geraeteActions', () => ({
  syncGeraetVerbrauch: syncMock,
}));

import {
  createMemoryStorage,
  getQueuedEntries,
  processQueue,
  setQueueStorage,
  setQueueUser,
} from '../../lib/offlineQueue';
import {
  enqueueGeraetVerbrauchSync,
  GERAET_VERBRAUCH_QUEUE_TYPE,
  isGeraetVerbrauchQueued,
  queueGeraetVerbrauchSync,
} from './geraetVerbrauchQueue';

describe('queueGeraetVerbrauchSync', () => {
  beforeEach(() => {
    offline.value = false;
    syncMock.mockReset();
    syncMock.mockResolvedValue({ deltas: 1 });
    setQueueStorage(createMemoryStorage());
    setQueueUser('u1', true);
  });

  it('gleicht online sofort ab und gibt die Erwartung weiter', async () => {
    await expect(queueGeraetVerbrauchSync('fc1', 'e1', { syncRev: 7 })).resolves.toBe('done');
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e1', { syncRev: 7 });
  });

  it('reiht offline je Eintrag nur einmal ein — mit der Erwartung der letzten Änderung', async () => {
    offline.value = true;
    await queueGeraetVerbrauchSync('fc1', 'e1', { syncRev: 1 });
    // Menge geändert, bevor das Netz zurück ist: ein Abgleich genügt, er liest
    // den Eintrag am Server frisch.
    await queueGeraetVerbrauchSync('fc1', 'e1', { syncRev: 2 });
    await queueGeraetVerbrauchSync('fc1', 'e2', { deleted: true });
    expect(syncMock).not.toHaveBeenCalled();
    const queued = await getQueuedEntries();
    expect(queued).toHaveLength(2);
    expect(queued.every((e) => e.type === GERAET_VERBRAUCH_QUEUE_TYPE)).toBe(true);

    offline.value = false;
    await processQueue();

    expect(syncMock).toHaveBeenCalledTimes(2);
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e1', { syncRev: 2 });
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e2', { deleted: true });
    expect(await getQueuedEntries()).toHaveLength(0);
  });

  it('wirft online einen Fehler des Servers an den Aufrufer weiter', async () => {
    syncMock.mockRejectedValueOnce(new Error('ABORTED'));
    await expect(queueGeraetVerbrauchSync('fc1', 'e1')).rejects.toThrow('ABORTED');
    expect(await getQueuedEntries()).toHaveLength(0);
  });
});

describe('enqueueGeraetVerbrauchSync', () => {
  beforeEach(() => {
    offline.value = false;
    syncMock.mockReset();
    setQueueStorage(createMemoryStorage());
    setQueueUser('u1', true);
  });

  it('reiht auch online ein und versucht es sofort erneut', async () => {
    syncMock.mockResolvedValue({ deltas: 1 });
    await enqueueGeraetVerbrauchSync('fc1', 'e1', { deleted: true });
    await processQueue();
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e1', { deleted: true });
    expect(await getQueuedEntries()).toHaveLength(0);
  });

  it('behält den Eintrag, solange der Server noch den alten Stand sieht', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    syncMock.mockRejectedValue(new Error('not yet in the expected state'));
    await enqueueGeraetVerbrauchSync('fc1', 'e1', { syncRev: 3 });
    await processQueue();
    const [entry] = await getQueuedEntries();
    expect(entry).toMatchObject({
      type: GERAET_VERBRAUCH_QUEUE_TYPE,
      payload: { firecallId: 'fc1', einsatzEintragId: 'e1', expect: { syncRev: 3 } },
    });
    expect(entry.attempts).toBeGreaterThan(0);
    expect(isGeraetVerbrauchQueued('fc1', 'e1')).toBe(true);
    expect(isGeraetVerbrauchQueued('fc1', 'e2')).toBe(false);
    error.mockRestore();
  });
});
