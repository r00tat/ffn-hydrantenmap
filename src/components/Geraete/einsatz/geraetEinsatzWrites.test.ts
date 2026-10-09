import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeraetEinsatz } from '../../../common/geraet';

const mocks = vi.hoisted(() => ({
  offline: false,
  addDocLocal: vi.fn((..._args: unknown[]) => ({ id: 'new-entry' })),
  updateDocLocal: vi.fn((..._args: unknown[]) => undefined),
  deleteDocLocal: vi.fn((..._args: unknown[]) => undefined),
  waitForFirestoreSync: vi.fn(async () => true),
  queueSync: vi.fn(async (..._args: unknown[]): Promise<'done' | 'queued'> => 'done'),
  enqueueSync: vi.fn(async (..._args: unknown[]) => undefined),
  queueZuordnung: vi.fn(async (..._args: unknown[]): Promise<'done' | 'queued'> => 'done'),
  enqueueZuordnung: vi.fn(async (..._args: unknown[]) => undefined),
  queued: new Set<string>(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  deleteField: vi.fn(() => 'DELETE'),
}));
vi.mock('../../firebase/firebase', () => ({ firestore: {} }));
vi.mock('../../../lib/firestoreClient', () => ({
  addDocLocal: mocks.addDocLocal,
  updateDocLocal: mocks.updateDocLocal,
  deleteDocLocal: mocks.deleteDocLocal,
}));
vi.mock('../../../lib/connectivity', () => ({ isOffline: () => mocks.offline }));
vi.mock('../../../lib/firestoreSync', () => ({
  waitForFirestoreSync: mocks.waitForFirestoreSync,
}));
vi.mock('../geraetVerbrauchQueue', () => ({
  queueGeraetVerbrauchSync: mocks.queueSync,
  enqueueGeraetVerbrauchSync: mocks.enqueueSync,
  isGeraetVerbrauchQueued: (firecallId: string, entryId: string) =>
    mocks.queued.has(`${firecallId}/${entryId}`),
}));

vi.mock('../geraetZuordnungQueue', () => ({
  queueGeraetZuordnungSync: mocks.queueZuordnung,
  enqueueGeraetZuordnungSync: mocks.enqueueZuordnung,
}));

import {
  addGeraetEinsatz,
  deleteGeraetEinsatz,
  nextSyncRev,
  resyncPendingBooking,
  updateGeraetEinsatz,
} from './geraetEinsatzWrites';

const verbrauch: Omit<GeraetEinsatz, 'id'> = {
  groupId: 'ffnd',
  geraetId: 'g1',
  geraetName: 'Bindevlies',
  art: 'verbraucht',
  bestandId: 'b1',
  menge: 2,
  zeitpunkt: '2026-10-04T10:00:00.000Z',
  createdAt: '2026-10-04T10:00:00.000Z',
  createdBy: 'erika.musterfrau@example.com',
};

const zuordnung: Omit<GeraetEinsatz, 'id'> = {
  ...verbrauch,
  art: 'zugeordnet',
  bestandId: undefined,
};
delete zuordnung.bestandId;

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('geraetEinsatzWrites', () => {
  beforeEach(() => {
    mocks.offline = false;
    vi.clearAllMocks();
    mocks.waitForFirestoreSync.mockResolvedValue(true);
    mocks.queueSync.mockResolvedValue('done');
    mocks.queueZuordnung.mockResolvedValue('done');
    mocks.queued.clear();
  });

  it('legt lokal an, gibt die ID sofort zurück und gleicht den Verbrauch ab', async () => {
    const id = addGeraetEinsatz('fc1', verbrauch);
    expect(id).toBe('new-entry');
    const [, written] = mocks.addDocLocal.mock.calls[0] as [unknown, { syncRev: number }];
    expect(mocks.addDocLocal).toHaveBeenCalledWith(
      { path: 'call/fc1/geraetEinsatz' },
      { ...verbrauch, syncRev: expect.any(Number) },
    );
    await flush();
    expect(mocks.waitForFirestoreSync).toHaveBeenCalled();
    // Der Server bucht erst, wenn er diesen Stand liest.
    expect(mocks.queueSync).toHaveBeenCalledWith('fc1', 'new-entry', {
      syncRev: written.syncRev,
    });
  });

  it('wartet offline nicht auf Firestore, sondern reiht direkt ein', async () => {
    mocks.offline = true;
    addGeraetEinsatz('fc1', verbrauch);
    await flush();
    expect(mocks.waitForFirestoreSync).not.toHaveBeenCalled();
    expect(mocks.queueSync).toHaveBeenCalledWith('fc1', 'new-entry', {
      syncRev: expect.any(Number),
    });
  });

  it('reiht ein, wenn Firestore online nicht rechtzeitig überträgt', async () => {
    mocks.waitForFirestoreSync.mockResolvedValue(false);
    addGeraetEinsatz('fc1', verbrauch);
    await flush();
    expect(mocks.queueSync).not.toHaveBeenCalled();
    expect(mocks.enqueueSync).toHaveBeenCalledWith('fc1', 'new-entry', {
      syncRev: expect.any(Number),
    });
  });

  it('reiht ein, wenn der Abgleich bei erreichbarem Server scheitert', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.queueSync.mockRejectedValueOnce(new Error('ABORTED'));
    expect(() => addGeraetEinsatz('fc1', verbrauch)).not.toThrow();
    await flush();
    expect(mocks.enqueueSync).toHaveBeenCalledWith('fc1', 'new-entry', {
      syncRev: expect.any(Number),
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('vergibt streng wachsende Stände, auch in derselben Millisekunde', () => {
    const a = nextSyncRev(1000);
    const b = nextSyncRev(1000);
    expect(b).toBeGreaterThan(a);
    // Läuft die Uhr voraus, gilt wieder die Uhrzeit.
    expect(nextSyncRev(b + 5000)).toBe(b + 5000);
  });

  it('eine Zuordnung braucht keinen Verbrauchsabgleich, wird aber protokolliert', async () => {
    addGeraetEinsatz('fc1', zuordnung);
    await flush();
    expect(mocks.queueSync).not.toHaveBeenCalled();
    expect(mocks.waitForFirestoreSync).toHaveBeenCalled();
    expect(mocks.queueZuordnung).toHaveBeenCalledWith('fc1', 'new-entry');
  });

  it('ein Verbrauch stößt kein Zuordnungsprotokoll an', async () => {
    addGeraetEinsatz('fc1', verbrauch);
    deleteGeraetEinsatz('fc1', { id: 'e2', ...verbrauch });
    await flush();
    expect(mocks.queueZuordnung).not.toHaveBeenCalled();
  });

  it('reiht das Zuordnungsprotokoll offline direkt ein', async () => {
    mocks.offline = true;
    addGeraetEinsatz('fc1', zuordnung);
    await flush();
    expect(mocks.waitForFirestoreSync).not.toHaveBeenCalled();
    expect(mocks.queueZuordnung).toHaveBeenCalledWith('fc1', 'new-entry');
  });

  it('reiht das Zuordnungsprotokoll ein, wenn Firestore online nicht rechtzeitig überträgt', async () => {
    mocks.waitForFirestoreSync.mockResolvedValue(false);
    addGeraetEinsatz('fc1', zuordnung);
    await flush();
    expect(mocks.queueZuordnung).not.toHaveBeenCalled();
    expect(mocks.enqueueZuordnung).toHaveBeenCalledWith('fc1', 'new-entry');
  });

  it('reiht das Zuordnungsprotokoll ein, wenn der Aufruf scheitert', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.queueZuordnung.mockRejectedValueOnce(new Error('ABORTED'));
    expect(() => addGeraetEinsatz('fc1', zuordnung)).not.toThrow();
    await flush();
    expect(mocks.enqueueZuordnung).toHaveBeenCalledWith('fc1', 'new-entry');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ändert lokal mit neuem Stand und gleicht einen Verbrauch neu ab', async () => {
    updateGeraetEinsatz(
      'fc1',
      { id: 'e1', ...verbrauch, syncRev: 1 },
      { menge: 3, gebucht: false },
    );
    const [, patch] = mocks.updateDocLocal.mock.calls[0] as [unknown, { syncRev: number }];
    expect(patch).toEqual({ menge: 3, gebucht: false, syncRev: expect.any(Number) });
    expect(patch.syncRev).toBeGreaterThan(1);
    expect(mocks.updateDocLocal).toHaveBeenCalledWith(
      { path: 'call/fc1/geraetEinsatz/e1' },
      patch,
    );
    await flush();
    expect(mocks.queueSync).toHaveBeenCalledWith('fc1', 'e1', { syncRev: patch.syncRev });
  });

  it('löscht lokal und bucht einen Verbrauch per Abgleich zurück', async () => {
    deleteGeraetEinsatz('fc1', { id: 'e2', ...verbrauch });
    expect(mocks.deleteDocLocal).toHaveBeenCalledWith({ path: 'call/fc1/geraetEinsatz/e2' });
    await flush();
    // Der Server bucht erst zurück, wenn der Eintrag auch bei ihm fehlt.
    expect(mocks.queueSync).toHaveBeenCalledWith('fc1', 'e2', { deleted: true });
  });

  it('Löschen einer Zuordnung ohne Verbrauchsabgleich, aber mit Protokoll', async () => {
    deleteGeraetEinsatz('fc1', { id: 'e3', ...zuordnung });
    await flush();
    expect(mocks.queueSync).not.toHaveBeenCalled();
    expect(mocks.queueZuordnung).toHaveBeenCalledWith('fc1', 'e3');
  });

  it('ein nicht einreihbarer Abgleich wirft nicht in den Dialog', async () => {
    mocks.queueSync.mockRejectedValueOnce(new Error('boom'));
    mocks.enqueueSync.mockRejectedValueOnce(new Error('IndexedDB gesperrt'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => addGeraetEinsatz('fc1', verbrauch)).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  describe('resyncPendingBooking', () => {
    const pending: GeraetEinsatz = { id: 'e9', ...verbrauch, syncRev: 42 };

    it('stößt einen ungebuchten Verbrauch mit dem gesehenen Stand erneut an', async () => {
      expect(resyncPendingBooking('fc1', pending)).toBe(true);
      await flush();
      expect(mocks.queueSync).toHaveBeenCalledWith('fc1', 'e9', { syncRev: 42 });
    });

    it('nicht bei gebuchten Einträgen und Zuordnungen', () => {
      expect(resyncPendingBooking('fc1', { ...pending, gebucht: true })).toBe(false);
      expect(resyncPendingBooking('fc1', { id: 'e8', ...zuordnung })).toBe(false);
      expect(mocks.queueSync).not.toHaveBeenCalled();
    });

    it('nicht, solange ein Abgleich läuft oder in der Warteschlange wartet', async () => {
      let release: () => void = () => {};
      mocks.queueSync.mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve('done'))),
      );
      expect(resyncPendingBooking('fc1', pending)).toBe(true);
      await flush();
      expect(resyncPendingBooking('fc1', pending)).toBe(false);
      release();
      await flush();
      expect(resyncPendingBooking('fc1', pending)).toBe(true);

      mocks.queued.add('fc1/e7');
      expect(resyncPendingBooking('fc1', { ...pending, id: 'e7' })).toBe(false);
    });
  });
});
