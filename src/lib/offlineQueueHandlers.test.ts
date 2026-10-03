import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  offline: false,
  plan: vi.fn(async () => 'scheduled'),
  upload: vi.fn(),
  updateDocLocal: vi.fn(),
  waitForFirestoreSync: vi.fn(async () => true),
  ensureFreshAuth: vi.fn(async () => true),
  order: [] as string[],
}));

vi.mock('./connectivity', () => ({
  isOffline: () => mocks.offline,
  onReconnect: () => () => {},
  checkConnectivityNow: async () => !mocks.offline,
}));
vi.mock('./syncErrors', () => ({ recordSyncError: vi.fn() }));
vi.mock('../components/firebase/firebase', () => ({
  default: {},
  firestore: { name: 'fs' },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_fs: unknown, path: string) => ({ path }),
  arrayUnion: (value: unknown) => ({ arrayUnion: value }),
}));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: (_storage: unknown, path: string) => ({ path }),
  uploadBytesResumable: (fileRef: { path: string }, ...rest: unknown[]) =>
    mocks.upload(fileRef, ...rest),
}));
vi.mock('./firestoreClient', () => ({
  updateDocLocal: (...args: unknown[]) => mocks.updateDocLocal(...args),
}));
vi.mock('./firestoreSync', () => ({
  waitForFirestoreSync: () => {
    mocks.order.push('sync');
    return mocks.waitForFirestoreSync();
  },
}));
vi.mock('../hooks/auth/ensureFreshAuth', () => ({
  ensureFreshAuth: () => {
    mocks.order.push('auth');
    return mocks.ensureFreshAuth();
  },
}));
vi.mock('../components/Atemschutz/ueberwachungTaskAction', () => ({
  planeUeberwachungWarnung: (...args: unknown[]) => {
    mocks.order.push('plan');
    return mocks.plan(...(args as []));
  },
}));

type Queue = typeof import('./offlineQueue');
type Handlers = typeof import('./offlineQueueHandlers');
let queue: Queue;
let handlers: Handlers;
let stop: () => void = () => {};

beforeEach(async () => {
  vi.resetModules();
  mocks.offline = true;
  mocks.order = [];
  mocks.plan.mockClear();
  mocks.upload.mockReset();
  mocks.updateDocLocal.mockReset();
  mocks.waitForFirestoreSync.mockClear();
  mocks.ensureFreshAuth.mockReset();
  mocks.ensureFreshAuth.mockResolvedValue(true);
  queue = await import('./offlineQueue');
  handlers = await import('./offlineQueueHandlers');
  queue.setQueueStorage(queue.createMemoryStorage());
  queue.setQueueUser('u1', true);
  stop = handlers.startOfflineQueueWithHandlers();
});

afterEach(() => {
  stop();
  queue.resetOfflineQueueForTests();
});

describe('offlineQueueHandlers', () => {
  it('registriert den Handler der Atemschutzwarnung über den Seiteneffekt-Import', async () => {
    const { planWarningOrQueue, PLAN_WARNING_QUEUE_TYPE } = await import(
      '../components/Atemschutz/ueberwachungWarnungQueue'
    );
    await planWarningOrQueue('fc1', 't1');
    const [entry] = await queue.getQueuedEntries();
    expect(entry.type).toBe(PLAN_WARNING_QUEUE_TYPE);

    mocks.offline = false;
    await queue.processQueue();

    expect(mocks.plan).toHaveBeenCalledWith('fc1', 't1');
    expect(await queue.getQueuedEntries()).toHaveLength(0);
  });

  it('wartet vor der Terminplanung auf Firestore und frischt die Anmeldung auf', async () => {
    const { planWarningOrQueue } = await import(
      '../components/Atemschutz/ueberwachungWarnungQueue'
    );
    await planWarningOrQueue('fc1', 't1');
    mocks.offline = false;
    await queue.processQueue();

    expect(mocks.order).toEqual(['sync', 'auth', 'plan']);
  });

  it('lässt die Einträge liegen, wenn die Anmeldung nicht aufzufrischen ist', async () => {
    mocks.ensureFreshAuth.mockResolvedValue(false);
    const { planWarningOrQueue } = await import(
      '../components/Atemschutz/ueberwachungWarnungQueue'
    );
    await planWarningOrQueue('fc1', 't1');
    mocks.offline = false;
    await queue.processQueue();

    expect(mocks.plan).not.toHaveBeenCalled();
    const [entry] = await queue.getQueuedEntries();
    expect(entry.attempts).toBe(0);
  });

  it('lädt einen eingereihten Upload hoch und trägt die Referenz ins Zielfeld ein', async () => {
    mocks.upload.mockResolvedValue({
      ref: { toString: () => 'gs://bucket/firecall/fc1/files/uuid-a.jpg' },
    });
    const { queueUpload } = await import('./uploadQueue');
    await queueUpload({
      storagePath: '/firecall/fc1/files/uuid-a.jpg',
      blob: new Blob(['x']),
      contentType: 'image/jpeg',
      fileName: 'a.jpg',
      target: { docPath: 'call/fc1/item/i1', field: 'attachments' },
    });

    mocks.offline = false;
    await queue.processQueue();

    expect(mocks.upload).toHaveBeenCalledWith(
      { path: '/firecall/fc1/files/uuid-a.jpg' },
      expect.any(Blob),
      { contentType: 'image/jpeg' },
    );
    expect(mocks.updateDocLocal).toHaveBeenCalledWith(
      { path: 'call/fc1/item/i1' },
      { attachments: { arrayUnion: 'gs://bucket/firecall/fc1/files/uuid-a.jpg' } },
    );
    expect(await queue.getQueuedEntries()).toHaveLength(0);
  });

  it('registriert die Handler nur einmal', () => {
    const second = handlers.startOfflineQueueWithHandlers();
    second();
    // Ein zweiter Start darf die Handler nicht verdoppeln oder ersetzen —
    // `runOrQueue` findet sie weiterhin.
    expect(() => queue.runOrQueue('storageUpload', {})).not.toThrow();
  });
});
