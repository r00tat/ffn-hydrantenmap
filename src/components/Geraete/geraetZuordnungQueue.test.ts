import { beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({ value: false }));
vi.mock('../../lib/connectivity', () => ({
  isOffline: () => offline.value,
  onReconnect: () => () => {},
  checkConnectivityNow: async () => !offline.value,
}));

const syncMock = vi.hoisted(() =>
  vi.fn(
    async (
      ..._args: unknown[]
    ): Promise<{ written: 'zuordnung' | 'zuordnungEnde' | null }> => ({ written: 'zuordnung' }),
  ),
);
vi.mock('./geraeteActions', () => ({
  syncGeraetZuordnung: syncMock,
}));

import {
  createMemoryStorage,
  getQueuedEntries,
  processQueue,
  setQueueStorage,
  setQueueUser,
} from '../../lib/offlineQueue';
import {
  enqueueGeraetZuordnungSync,
  GERAET_ZUORDNUNG_QUEUE_TYPE,
  isGeraetZuordnungQueued,
  queueGeraetZuordnungSync,
} from './geraetZuordnungQueue';

describe('queueGeraetZuordnungSync', () => {
  beforeEach(() => {
    offline.value = false;
    syncMock.mockReset();
    syncMock.mockResolvedValue({ written: 'zuordnung' });
    setQueueStorage(createMemoryStorage());
    setQueueUser('u1', true);
  });

  it('protokolliert online sofort', async () => {
    await expect(queueGeraetZuordnungSync('fc1', 'e1')).resolves.toBe('done');
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e1');
  });

  it('reiht offline je Eintrag nur einmal ein', async () => {
    offline.value = true;
    // Angelegt und wieder gelöscht, bevor das Netz zurück ist: ein Abgleich.
    await queueGeraetZuordnungSync('fc1', 'e1');
    await queueGeraetZuordnungSync('fc1', 'e1');
    await queueGeraetZuordnungSync('fc1', 'e2');
    expect(syncMock).not.toHaveBeenCalled();
    const queued = await getQueuedEntries();
    expect(queued).toHaveLength(2);
    expect(queued.every((e) => e.type === GERAET_ZUORDNUNG_QUEUE_TYPE)).toBe(true);

    offline.value = false;
    await processQueue();

    expect(syncMock).toHaveBeenCalledTimes(2);
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e1');
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e2');
    expect(await getQueuedEntries()).toHaveLength(0);
  });

  it('wirft online einen Fehler des Servers an den Aufrufer weiter', async () => {
    syncMock.mockRejectedValueOnce(new Error('ABORTED'));
    await expect(queueGeraetZuordnungSync('fc1', 'e1')).rejects.toThrow('ABORTED');
    expect(await getQueuedEntries()).toHaveLength(0);
  });
});

describe('enqueueGeraetZuordnungSync', () => {
  beforeEach(() => {
    offline.value = false;
    syncMock.mockReset();
    setQueueStorage(createMemoryStorage());
    setQueueUser('u1', true);
  });

  it('reiht auch online ein und versucht es sofort erneut', async () => {
    syncMock.mockResolvedValue({ written: 'zuordnungEnde' });
    await enqueueGeraetZuordnungSync('fc1', 'e1');
    await processQueue();
    expect(syncMock).toHaveBeenCalledWith('fc1', 'e1');
    expect(await getQueuedEntries()).toHaveLength(0);
  });

  it('behält den Eintrag, solange der Server ablehnt', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    syncMock.mockRejectedValue(new Error('ABORTED'));
    await enqueueGeraetZuordnungSync('fc1', 'e1');
    await processQueue();
    const [entry] = await getQueuedEntries();
    expect(entry).toMatchObject({
      type: GERAET_ZUORDNUNG_QUEUE_TYPE,
      payload: { firecallId: 'fc1', einsatzEintragId: 'e1' },
    });
    expect(entry.attempts).toBeGreaterThan(0);
    expect(isGeraetZuordnungQueued('fc1', 'e1')).toBe(true);
    expect(isGeraetZuordnungQueued('fc1', 'e2')).toBe(false);
    error.mockRestore();
  });
});
