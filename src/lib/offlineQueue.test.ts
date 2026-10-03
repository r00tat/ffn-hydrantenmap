import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connectivityState = vi.hoisted(() => ({
  offline: false,
  reconnect: new Set<() => void>(),
  checkResult: true,
}));

vi.mock('./connectivity', () => ({
  isOffline: () => connectivityState.offline,
  onReconnect: (cb: () => void) => {
    connectivityState.reconnect.add(cb);
    return () => connectivityState.reconnect.delete(cb);
  },
  checkConnectivityNow: vi.fn(async () => {
    connectivityState.offline = !connectivityState.checkResult;
    return connectivityState.checkResult;
  }),
}));

const recordSyncErrorMock = vi.hoisted(() => vi.fn());
vi.mock('./syncErrors', () => ({
  recordSyncError: recordSyncErrorMock,
}));

type QueueModule = typeof import('./offlineQueue');
let queue: QueueModule;

beforeEach(async () => {
  vi.resetModules();
  connectivityState.offline = false;
  connectivityState.checkResult = true;
  connectivityState.reconnect.clear();
  recordSyncErrorMock.mockReset();
  queue = await import('./offlineQueue');
  queue.setQueueStorage(queue.createMemoryStorage());
});

afterEach(() => {
  queue.resetOfflineQueueForTests();
});

describe('offlineQueue', () => {
  it('führt online direkt aus und reiht nichts ein', async () => {
    const handler = vi.fn(async () => undefined);
    queue.registerQueueHandler('test', handler);

    const result = await queue.runOrQueue('test', { a: 1 });

    expect(result).toBe('done');
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    expect(await queue.getQueuedEntries()).toHaveLength(0);
  });

  it('reiht offline ein, ohne den Handler aufzurufen', async () => {
    connectivityState.offline = true;
    const handler = vi.fn(async () => undefined);
    queue.registerQueueHandler('test', handler);

    const result = await queue.runOrQueue('test', { a: 1 }, { key: 'k1' });

    expect(result).toBe('queued');
    expect(handler).not.toHaveBeenCalled();
    const entries = await queue.getQueuedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'k1', type: 'test', payload: { a: 1 } });
  });

  it('reiht ein, wenn der direkte Aufruf scheitert und der Server nicht erreichbar ist', async () => {
    connectivityState.checkResult = false;
    queue.registerQueueHandler('test', async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await queue.runOrQueue('test', { a: 1 });

    expect(result).toBe('queued');
    expect(await queue.getQueuedEntries()).toHaveLength(1);
  });

  it('wirft weiter, wenn der direkte Aufruf online scheitert', async () => {
    queue.registerQueueHandler('test', async () => {
      throw new Error('boom');
    });

    await expect(queue.runOrQueue('test', {})).rejects.toThrow('boom');
    expect(await queue.getQueuedEntries()).toHaveLength(0);
  });

  it('ersetzt einen Eintrag mit demselben Schlüssel (idempotent)', async () => {
    connectivityState.offline = true;
    queue.registerQueueHandler('test', async () => undefined);

    await queue.runOrQueue('test', { v: 1 }, { key: 'same' });
    await queue.runOrQueue('test', { v: 2 }, { key: 'same' });

    const entries = await queue.getQueuedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toEqual({ v: 2 });
  });

  it('arbeitet die Warteschlange beim Reconnect in Reihenfolge ab', async () => {
    connectivityState.offline = true;
    const calls: unknown[] = [];
    queue.registerQueueHandler('test', async (payload) => {
      calls.push(payload);
    });
    const stop = queue.startOfflineQueue();
    await queue.runOrQueue('test', 1);
    await queue.runOrQueue('test', 2);
    expect(calls).toEqual([]);

    connectivityState.offline = false;
    for (const cb of connectivityState.reconnect) cb();
    await queue.processQueue();

    expect(calls).toEqual([1, 2]);
    expect(await queue.getQueuedEntries()).toHaveLength(0);
    stop();
  });

  it('arbeitet beim Start ab, was ein früherer Lauf eingereiht hat', async () => {
    const storage = queue.createMemoryStorage();
    await storage.put({
      id: 'old',
      type: 'test',
      kind: 'action',
      payload: 'x',
      createdAt: 1,
      attempts: 0,
    });
    queue.setQueueStorage(storage);
    const handler = vi.fn(async () => undefined);
    queue.registerQueueHandler('test', handler);

    const stop = queue.startOfflineQueue();
    await queue.processQueue();

    expect(handler).toHaveBeenCalledWith('x');
    expect(await storage.getAll()).toHaveLength(0);
    stop();
  });

  it('bricht ab, wenn die Verbindung während des Abarbeitens wegfällt', async () => {
    connectivityState.offline = true;
    const calls: unknown[] = [];
    queue.registerQueueHandler('test', async (payload) => {
      calls.push(payload);
      connectivityState.offline = true;
      throw new TypeError('Failed to fetch');
    });
    await queue.runOrQueue('test', 1);
    await queue.runOrQueue('test', 2);

    connectivityState.offline = false;
    await queue.processQueue();

    expect(calls).toEqual([1]);
    const entries = await queue.getQueuedEntries();
    expect(entries).toHaveLength(2);
    // Ein Netzfehler zählt nicht als Fehlversuch.
    expect(entries[0].attempts).toBe(0);
  });

  it('verwirft einen Eintrag nach zu vielen Fehlversuchen und meldet ihn', async () => {
    connectivityState.offline = true;
    queue.registerQueueHandler('test', async () => {
      throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    });
    await queue.runOrQueue('test', 1, { label: 'Trupp 1' });
    connectivityState.offline = false;

    for (let i = 0; i < queue.MAX_QUEUE_ATTEMPTS; i++) {
      await queue.processQueue();
    }

    expect(await queue.getQueuedEntries()).toHaveLength(0);
    expect(recordSyncErrorMock).toHaveBeenCalledTimes(1);
    expect(recordSyncErrorMock.mock.calls[0][0]).toMatchObject({
      kind: 'action',
      path: 'Trupp 1',
    });
  });

  it('lässt Einträge ohne registrierten Handler liegen', async () => {
    connectivityState.offline = true;
    await queue.enqueue('unknown', 1);
    connectivityState.offline = false;

    await queue.processQueue();

    expect(await queue.getQueuedEntries()).toHaveLength(1);
  });

  it('meldet Änderungen an Abonnenten und liefert einen stabilen Schnappschuss', async () => {
    connectivityState.offline = true;
    const listener = vi.fn();
    const unsubscribe = queue.subscribeQueue(listener);
    const before = queue.getQueueSnapshot();
    expect(queue.getQueueSnapshot()).toBe(before);

    await queue.enqueue('test', 1, { key: 'a' });

    expect(listener).toHaveBeenCalled();
    expect(queue.getQueueSnapshot()).not.toBe(before);
    expect(queue.getQueueSnapshot().map((e) => e.id)).toEqual(['a']);
    unsubscribe();
  });
});
