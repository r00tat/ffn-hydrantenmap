import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Ein kleines Firestore im Speicher — gerade so viel, wie die Actions
 * benutzen: Dokumente, Abfragen mit `==`/`>`, Transaktionen (mit der Regel
 * „erst lesen, dann schreiben"), Batches und die Sentinels `increment` und
 * `delete`. Damit prüfen die Tests den Datenstand nach einer Action und
 * nicht die Reihenfolge einzelner Mock-Aufrufe.
 */
const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const docs = new Map<string, Data>();
  const batchSizes: number[] = [];
  let autoId = 0;

  const DELETE = { __op: 'delete' };
  const increment = (n: number) => ({ __op: 'increment', n });

  function isOp(v: unknown, op: string): v is { __op: string; n: number } {
    return typeof v === 'object' && v !== null && (v as { __op?: string }).__op === op;
  }

  function apply(base: Data, data: Data): Data {
    const next: Data = { ...base };
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) throw new Error(`undefined value for ${k}`);
      if (isOp(v, 'delete')) delete next[k];
      else if (isOp(v, 'increment')) next[k] = ((next[k] as number) ?? 0) + v.n;
      else next[k] = structuredClone(v);
    }
    return next;
  }

  type Write =
    | { kind: 'set'; path: string; data: Data; merge?: boolean }
    | { kind: 'update'; path: string; data: Data }
    | { kind: 'create'; path: string; data: Data }
    | { kind: 'delete'; path: string };

  function commit(writes: Write[]) {
    for (const w of writes) {
      if (w.kind === 'update' && !docs.has(w.path)) {
        throw new Error(`NOT_FOUND ${w.path}`);
      }
      if (w.kind === 'create' && docs.has(w.path)) {
        throw new Error(`ALREADY_EXISTS ${w.path}`);
      }
    }
    for (const w of writes) {
      if (w.kind === 'delete') docs.delete(w.path);
      else if (w.kind === 'set' && !w.merge) docs.set(w.path, apply({}, w.data));
      else docs.set(w.path, apply(docs.get(w.path) ?? {}, w.data));
    }
  }

  interface FakeSnap {
    id: string;
    exists: boolean;
    data: () => Data | undefined;
    ref: FakeDocRef;
  }
  interface FakeQuerySnap {
    docs: FakeSnap[];
    empty: boolean;
    size: number;
    forEach: (fn: (s: FakeSnap) => void) => void;
  }
  interface FakeQuery {
    __query: true;
    where: (field: string, op: string, value: unknown) => FakeQuery;
    get: () => Promise<FakeQuerySnap>;
  }
  interface FakeDocRef {
    id: string;
    path: string;
    get: () => Promise<FakeSnap>;
    set: (data: Data, opts?: { merge?: boolean }) => Promise<void>;
    update: (data: Data) => Promise<void>;
    delete: () => Promise<void>;
    collection: (name: string) => FakeCollection;
  }
  interface FakeCollection extends FakeQuery {
    id: string;
    path: string;
    doc: (id?: string) => FakeDocRef;
  }

  function snap(path: string): FakeSnap {
    const data = docs.get(path);
    const id = path.split('/').pop()!;
    return {
      id,
      exists: data !== undefined,
      data: () => (data ? structuredClone(data) : undefined),
      ref: docRef(path),
    };
  }

  type Filter = { field: string; op: string; value: unknown };

  function query(colPath: string, filters: Filter[]): FakeQuery {
    return {
      __query: true,
      where(field: string, op: string, value: unknown) {
        return query(colPath, [...filters, { field, op, value }]);
      },
      async get(): Promise<FakeQuerySnap> {
        const depth = colPath.split('/').length + 1;
        const matches: FakeSnap[] = [...docs.keys()]
          .filter((p) => p.startsWith(`${colPath}/`) && p.split('/').length === depth)
          .sort()
          .map((p) => snap(p))
          .filter((s) =>
            filters.every(({ field, op, value }) => {
              const v = (s.data() as Data)[field];
              if (op === '==') return v === value;
              if (op === '>') return v !== undefined && (v as string) > (value as string);
              if (op === '!=') return v !== value;
              throw new Error(`op ${op} not supported`);
            }),
          );
        return {
          docs: matches,
          empty: matches.length === 0,
          size: matches.length,
          forEach: (fn: (s: FakeSnap) => void) => matches.forEach(fn),
        };
      },
    };
  }

  function collectionRef(path: string): FakeCollection {
    return {
      id: path.split('/').pop()!,
      path,
      doc(id?: string) {
        return docRef(`${path}/${id ?? `auto${++autoId}`}`);
      },
      ...query(path, []),
    };
  }

  function docRef(path: string): FakeDocRef {
    return {
      id: path.split('/').pop()!,
      path,
      get: async () => snap(path),
      set: async (data, opts) =>
        commit([{ kind: 'set', path, data, merge: opts?.merge }]),
      update: async (data) => commit([{ kind: 'update', path, data }]),
      delete: async () => commit([{ kind: 'delete', path }]),
      collection: (name) => collectionRef(`${path}/${name}`),
    };
  }

  const firestore = {
    collection: (name: string) => collectionRef(name),
    getAll: (...refs: { get: () => Promise<FakeSnap> }[]) =>
      Promise.all(refs.map((r) => r.get())),
    batch() {
      const writes: Write[] = [];
      return {
        set: (ref: { path: string }, data: Data, opts?: { merge?: boolean }) => {
          writes.push({ kind: 'set', path: ref.path, data, merge: opts?.merge });
        },
        update: (ref: { path: string }, data: Data) => {
          writes.push({ kind: 'update', path: ref.path, data });
        },
        create: (ref: { path: string }, data: Data) => {
          writes.push({ kind: 'create', path: ref.path, data });
        },
        delete: (ref: { path: string }) => {
          writes.push({ kind: 'delete', path: ref.path });
        },
        commit: async () => {
          batchSizes.push(writes.length);
          commit(writes);
        },
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const writes: Write[] = [];
      const tx = {
        async get(target: { get: () => Promise<unknown> }) {
          if (writes.length > 0) {
            throw new Error('Firestore transactions require all reads before writes');
          }
          return target.get();
        },
        set(ref: { path: string }, data: Data, opts?: { merge?: boolean }) {
          writes.push({ kind: 'set', path: ref.path, data, merge: opts?.merge });
          return tx;
        },
        update(ref: { path: string }, data: Data) {
          writes.push({ kind: 'update', path: ref.path, data });
          return tx;
        },
        create(ref: { path: string }, data: Data) {
          writes.push({ kind: 'create', path: ref.path, data });
          return tx;
        },
        delete(ref: { path: string }) {
          writes.push({ kind: 'delete', path: ref.path });
          return tx;
        },
      };
      const result = await fn(tx);
      commit(writes);
      return result;
    },
  };

  return {
    docs,
    batchSizes,
    firestore,
    FieldValue: { delete: () => DELETE, increment },
    reset() {
      docs.clear();
      batchSizes.length = 0;
      autoId = 0;
    },
    put(path: string, data: Data) {
      docs.set(path, structuredClone(data));
    },
    get(path: string) {
      return docs.get(path);
    },
    list(colPath: string) {
      const depth = colPath.split('/').length + 1;
      return [...docs.entries()]
        .filter(([p]) => p.startsWith(`${colPath}/`) && p.split('/').length === depth)
        .map(([p, d]) => ({ id: p.split('/').pop()!, ...d }));
    },
  };
});

const { managerGuard, firecallGuard, userGuard, notifyMock } = vi.hoisted(() => ({
  managerGuard: vi.fn(),
  firecallGuard: vi.fn(),
  userGuard: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('../../server/firebase/admin', () => ({ firestore: fake.firestore }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: fake.FieldValue }));
vi.mock('../firebase/firestore', () => ({
  GROUP_COLLECTION_ID: 'groups',
  FIRECALL_COLLECTION_ID: 'call',
}));
vi.mock('../Fahrtenbuch/authGuards', () => ({
  actionFahrtenbuchManagerRequired: managerGuard,
}));
vi.mock('../../app/auth', () => ({
  actionUserAuthorizedForFirecall: firecallGuard,
  actionUserRequired: userGuard,
}));
vi.mock('./notifyNachbestellung', () => ({ notifyNachbestellung: notifyMock }));
// Die Tests schicken das Raster als JSON statt als echte XLSX-Datei.
vi.mock('../../common/xlsx', () => ({
  readXlsxSheet: (data: Uint8Array) =>
    JSON.parse(Buffer.from(data).toString('utf-8')) as string[][],
}));

import {
  deviationKey,
  GERAET_CHARGE_MAX_TEXT,
  GERAET_CHARGEN_MAX,
  isBestandBuchung,
  lagerortKey,
  type GeraetBuchungArt,
  type GeraetLagerort,
} from '../../common/geraet';
import { GERAET_EXPORT_COLUMNS } from '../../common/geraetImport';
import {
  archiveGeraetCharge,
  aufteilenGeraetBestand,
  ausbuchenGeraetCharge,
  bookGeraetBestand,
  createGeraetBestand,
  deleteGeraet,
  deleteGeraetBestand,
  deleteGeraetSet,
  importGeraete,
  previewGeraetImport,
  saveGeraet,
  saveGeraetCharge,
  saveGeraetSet,
  setGeraeteVerbrauchsmaterial,
  syncGeraetVerbrauch,
  syncGeraetZuordnung,
  updateGeraetBestand,
} from './geraeteActions';

const G = 'groups/ffnd';
const session = { user: { id: 'u1', name: 'Max Mustermann', groups: ['ffnd'] } };

const srf: GeraetLagerort = { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' };
const lager: GeraetLagerort = { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' };

function putGeraet(id: string, data: Record<string, unknown> = {}) {
  fake.put(`${G}/geraet/${id}`, {
    bezeichnung: 'Bindevlies Economy',
    verbrauchsmaterial: true,
    bestandGesamt: 0,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u0',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u0',
    ...data,
  });
}

function putBestand(id: string, geraetId: string, lagerort: GeraetLagerort, anzahl: number) {
  fake.put(`${G}/geraetBestand/${id}`, {
    geraetId,
    lagerort,
    lagerortKey: lagerortKey(lagerort),
    anzahl,
  });
}

type BuchungRow = {
  id: string;
  art: string;
  menge: number;
  bestandId: string;
  geraetId: string;
  zielBestandId?: string;
  einsatzEintragId?: string;
  firecallId?: string;
  firecallName?: string;
  firecallArt?: string;
  chargeId?: string;
  bemerkung?: string;
  lagerortText?: string;
  aenderungen?: { feld: string; vorher?: string; nachher?: string }[];
  createdBy: string;
};

/** Alle Einträge in `geraetBuchung`, Mengenbuchungen und Protokoll. */
function alleBuchungen() {
  return fake.list(`${G}/geraetBuchung`) as unknown as BuchungRow[];
}

/** Nur die Buchungen, die eine Menge bewegen. */
function buchungen() {
  return alleBuchungen().filter((b) => isBestandBuchung(b.art as GeraetBuchungArt));
}

/** Nur die Protokolleinträge ohne Menge (Stammdaten, Chargen, Lagerorte …). */
function protokoll(geraetId?: string) {
  return alleBuchungen().filter(
    (b) =>
      !isBestandBuchung(b.art as GeraetBuchungArt) &&
      (geraetId === undefined || b.geraetId === geraetId),
  );
}

function geraet(id: string) {
  return fake.get(`${G}/geraet/${id}`) as Record<string, unknown> | undefined;
}

function bestand(id: string) {
  return fake.get(`${G}/geraetBestand/${id}`) as Record<string, unknown> | undefined;
}

function sumOfBestaende(geraetId: string): number {
  return fake
    .list(`${G}/geraetBestand`)
    .filter((b) => (b as { geraetId?: string }).geraetId === geraetId)
    .reduce((s, b) => s + ((b as { anzahl?: number }).anzahl ?? 0), 0);
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  managerGuard.mockResolvedValue(session);
  userGuard.mockResolvedValue(session);
  firecallGuard.mockResolvedValue({ id: 'fc1', name: 'Ölspur B50', group: 'ffnd' });
  notifyMock.mockResolvedValue(true);
});

describe('Guards der Pflege-Actions', () => {
  it.each([
    ['saveGeraet', () => saveGeraet('ffnd', { bezeichnung: 'X' })],
    ['deleteGeraet', () => deleteGeraet('ffnd', 'g1')],
    ['setGeraeteVerbrauchsmaterial', () => setGeraeteVerbrauchsmaterial('ffnd', ['g1'], false)],
    ['createGeraetBestand', () => createGeraetBestand('ffnd', 'g1', srf)],
    [
      'bookGeraetBestand',
      () => bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 1 }),
    ],
    ['updateGeraetBestand', () => updateGeraetBestand('ffnd', 'b1', lager)],
    ['deleteGeraetBestand', () => deleteGeraetBestand('ffnd', 'b1')],
    ['previewGeraetImport', () => previewGeraetImport('ffnd', '')],
    ['importGeraete', () => importGeraete('ffnd', '', [])],
  ])('%s verlangt Gruppen-Admin oder Gerätemeister', async (_name, call) => {
    putGeraet('g1');
    putBestand('b1', 'g1', srf, 1);
    const before = JSON.stringify([...fake.docs.entries()]);
    managerGuard.mockRejectedValue(new Error('forbidden'));
    await expect(call()).rejects.toThrow('forbidden');
    expect(managerGuard).toHaveBeenCalledWith('ffnd');
    expect(JSON.stringify([...fake.docs.entries()])).toBe(before);
  });
});

describe('saveGeraet', () => {
  it('legt einen Artikel mit Bestand 0 an und ignoriert berechnete Felder', async () => {
    const { id } = await saveGeraet('ffnd', {
      bezeichnung: '  Bindevlies Economy ',
      verbrauchsmaterial: true,
      einheit: 'Sack',
      mindestbestand: 5,
      bestandGesamt: 999,
      nachbestellenSeit: '2020-01-01T00:00:00.000Z',
      importedAt: '2020-01-01T00:00:00.000Z',
    } as never);
    const g = geraet(id)!;
    expect(g).toMatchObject({
      bezeichnung: 'Bindevlies Economy',
      verbrauchsmaterial: true,
      einheit: 'Sack',
      mindestbestand: 5,
      bestandGesamt: 0,
      active: true,
      createdBy: 'u1',
      updatedBy: 'u1',
    });
    // Ein neuer Artikel mit Mindestbestand 5 und Bestand 0 gehört auf die
    // Liste — ohne Mail, unterschritten wurde nichts.
    expect(g.nachbestellenSeit).toEqual(expect.any(String));
    expect(g.nachbestellenSeit).not.toBe('2020-01-01T00:00:00.000Z');
    expect(g.importedAt).toBeUndefined();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('verlangt beim Anlegen eine Bezeichnung', async () => {
    await expect(saveGeraet('ffnd', { bezeichnung: '  ' })).rejects.toThrow(
      /bezeichnung/i,
    );
    expect(fake.list(`${G}/geraet`)).toHaveLength(0);
  });

  it('ändert nur übergebene Felder und löscht geleerte', async () => {
    putGeraet('g1', { einheit: 'Sack', bemerkung: 'alt', bestandGesamt: 7 });
    await saveGeraet('ffnd', { id: 'g1', bemerkung: '', kostenersatzRateId: '12.05' });
    const g = geraet('g1')!;
    expect(g.bemerkung).toBeUndefined();
    expect(g.kostenersatzRateId).toBe('12.05');
    expect(g.einheit).toBe('Sack');
    expect(g.bestandGesamt).toBe(7);
    expect(g.updatedBy).toBe('u1');
    expect(g.createdBy).toBe('u0');
  });

  it('setzt und löscht die Nachbestellung beim Ändern des Mindestbestands', async () => {
    putGeraet('g1', { bestandGesamt: 3 });
    await saveGeraet('ffnd', { id: 'g1', mindestbestand: 5 });
    expect(geraet('g1')!.nachbestellenSeit).toEqual(expect.any(String));
    await saveGeraet('ffnd', { id: 'g1', mindestbestand: null } as never);
    expect(geraet('g1')!.mindestbestand).toBeUndefined();
    expect(geraet('g1')!.nachbestellenSeit).toBeUndefined();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('lehnt einen unbekannten Artikel ab', async () => {
    await expect(saveGeraet('ffnd', { id: 'fehlt', bezeichnung: 'X' })).rejects.toThrow(
      /not found/i,
    );
    expect(geraet('fehlt')).toBeUndefined();
  });

  it('lehnt eine ID mit Schrägstrich ab', async () => {
    await expect(saveGeraet('ffnd', { id: 'a/b', bezeichnung: 'X' })).rejects.toThrow();
  });

  it('speichert alle Sybos-Stammdaten und verwirft unsinnige Werte', async () => {
    const { id } = await saveGeraet('ffnd', {
      bezeichnung: 'Mehrgasmessgerät 1',
      vorlage: ' Gasmessgerät ',
      zubehoer: 'Pumpe',
      versicherung: 'Muster Versicherung',
      polizzenummer: 'P-1',
      kasko: 'ja',
      lebensdauer: 10,
      lebensdauerEinheit: 'Jahr(e)',
      anschaffungsDatum: '2015-07-20',
      verfuegbarVon: '2015-07-21',
      verfuegbarBis: '2025-01-20',
      baumonat: 5,
      einkaufspreis: 1078.8,
    });
    expect(geraet(id)).toMatchObject({
      vorlage: 'Gasmessgerät',
      zubehoer: 'Pumpe',
      versicherung: 'Muster Versicherung',
      polizzenummer: 'P-1',
      kasko: 'ja',
      lebensdauer: 10,
      lebensdauerEinheit: 'Jahr(e)',
      anschaffungsDatum: '2015-07-20',
      verfuegbarVon: '2015-07-21',
      verfuegbarBis: '2025-01-20',
      baumonat: 5,
      einkaufspreis: 1078.8,
    });

    await saveGeraet('ffnd', {
      id,
      anschaffungsDatum: '20.07.2015',
      baumonat: 13,
      einkaufspreis: -1,
      lebensdauer: 0,
      vorlage: '',
    });
    const g = geraet(id)!;
    for (const field of ['anschaffungsDatum', 'baumonat', 'einkaufspreis', 'lebensdauer', 'vorlage']) {
      expect(g).not.toHaveProperty(field);
    }
    expect(g.verfuegbarBis).toBe('2025-01-20');
  });

  it('übernimmt nur gültige Werte für Material-Typ, Einheit und Barcodes', async () => {
    const { id } = await saveGeraet('ffnd', {
      bezeichnung: 'Filter',
      materialTyp: 'Quatsch',
      einheitVerwendungsnachweis: 'h',
      barcodes: [' 123 ', '', '123', '456'],
      mindestbestand: -2,
    } as never);
    const g = geraet(id)!;
    expect(g.materialTyp).toBeUndefined();
    expect(g.einheitVerwendungsnachweis).toBe('h');
    expect(g.barcodes).toEqual(['123', '456']);
    expect(g.mindestbestand).toBeUndefined();
  });
});

describe('setGeraeteVerbrauchsmaterial', () => {
  it('markiert mehrere Artikel auf einmal als Verbrauchsmaterial', async () => {
    putGeraet('g1', { verbrauchsmaterial: false });
    putGeraet('g2', { verbrauchsmaterial: false });
    const result = await setGeraeteVerbrauchsmaterial('ffnd', ['g1', 'g2'], true);
    expect(result).toEqual({ updated: 2 });
    expect(geraet('g1')).toMatchObject({ verbrauchsmaterial: true, updatedBy: 'u1' });
    expect(geraet('g2')).toMatchObject({ verbrauchsmaterial: true, updatedBy: 'u1' });
  });

  it('nimmt beim Abschalten Mindestbestand und Nachbestellung weg', async () => {
    putGeraet('g1', {
      mindestbestand: 5,
      bestandGesamt: 2,
      nachbestellenSeit: '2026-01-02T00:00:00.000Z',
    });
    await setGeraeteVerbrauchsmaterial('ffnd', ['g1'], false);
    const g = geraet('g1')!;
    expect(g.verbrauchsmaterial).toBe(false);
    expect(g.mindestbestand).toBeUndefined();
    expect(g.nachbestellenSeit).toBeUndefined();
    expect(g.bestandGesamt).toBe(2);
  });

  it('lässt Artikel mit dem Wert schon und unbekannte IDs aus', async () => {
    putGeraet('g1', { verbrauchsmaterial: true });
    putGeraet('g2', { verbrauchsmaterial: false });
    const result = await setGeraeteVerbrauchsmaterial('ffnd', ['g1', 'g2', 'g2', 'fehlt'], true);
    expect(result).toEqual({ updated: 1 });
    expect(geraet('g1')!.updatedBy).toBe('u0');
    expect(geraet('fehlt')).toBeUndefined();
  });

  it('teilt große Auswahlen auf mehrere Batches', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `g${i}`);
    for (const id of ids) putGeraet(id, { verbrauchsmaterial: false });
    const result = await setGeraeteVerbrauchsmaterial('ffnd', ids, true);
    expect(result).toEqual({ updated: 500 });
    expect(Math.max(...fake.batchSizes)).toBeLessThanOrEqual(450);
  });

  it('lehnt ungültige Eingaben ab', async () => {
    await expect(
      setGeraeteVerbrauchsmaterial('ffnd', 'g1' as never, true),
    ).rejects.toThrow(/invalid/);
    await expect(setGeraeteVerbrauchsmaterial('ffnd', ['a/b'], true)).rejects.toThrow();
    await expect(
      setGeraeteVerbrauchsmaterial('ffnd', ['g1'], 'ja' as never),
    ).rejects.toThrow(/invalid/);
  });
});

describe('deleteGeraet', () => {
  it('löscht einen Artikel ohne Buchungen samt Beständen und Import-Buchungen', async () => {
    putGeraet('g1', { bestandGesamt: 3 });
    putGeraet('g2');
    putBestand('b1', 'g1', srf, 3);
    putBestand('b2', 'g2', srf, 1);
    fake.put(`${G}/geraetBuchung/k1`, { geraetId: 'g1', bestandId: 'b1', art: 'import', menge: 3 });
    await expect(deleteGeraet('ffnd', 'g1')).resolves.toEqual({ id: 'g1', deleted: true });
    expect(geraet('g1')).toBeUndefined();
    expect(bestand('b1')).toBeUndefined();
    expect(alleBuchungen()).toHaveLength(0);
    expect(bestand('b2')).toBeDefined();
  });

  it('deaktiviert einen Artikel mit Buchungen statt ihn zu löschen', async () => {
    putGeraet('g1', { bestandGesamt: 2 });
    putBestand('b1', 'g1', srf, 2);
    fake.put(`${G}/geraetBuchung/k1`, { geraetId: 'g1', bestandId: 'b1', art: 'verbrauch', menge: -1 });
    await expect(deleteGeraet('ffnd', 'g1')).resolves.toEqual({ id: 'g1', deleted: false });
    expect(geraet('g1')!.active).toBe(false);
    expect(bestand('b1')).toBeDefined();
  });

  it('löscht einen Artikel, der neben dem Import nur Protokolleinträge hat', async () => {
    putGeraet('g1', { bestandGesamt: 3 });
    putBestand('b1', 'g1', srf, 3);
    fake.put(`${G}/geraetBuchung/k1`, { geraetId: 'g1', bestandId: 'b1', art: 'import', menge: 3 });
    fake.put(`${G}/geraetBuchung/k2`, {
      geraetId: 'g1',
      art: 'stammdaten',
      menge: 0,
      aenderungen: [{ feld: 'mindestbestand', vorher: '2', nachher: '5' }],
    });
    fake.put(`${G}/geraetBuchung/k3`, { geraetId: 'g1', bestandId: 'b1', art: 'lagerort', menge: 0 });
    await expect(deleteGeraet('ffnd', 'g1')).resolves.toEqual({ id: 'g1', deleted: true });
    expect(geraet('g1')).toBeUndefined();
    expect(bestand('b1')).toBeUndefined();
    expect(alleBuchungen()).toHaveLength(0);
  });
});

describe('createdByName an der Buchung', () => {
  it('schreibt den Namen des Erfassers', async () => {
    putGeraet('g1');
    await createGeraetBestand('ffnd', 'g1', srf, 4);
    expect(buchungen()).toEqual([
      expect.objectContaining({ createdBy: 'u1', createdByName: 'Max Mustermann' }),
    ]);
  });

  it('nimmt ohne Namen die E-Mail', async () => {
    managerGuard.mockResolvedValue({
      user: { id: 'u1', email: 'max@example.org', groups: ['ffnd'] },
    });
    putGeraet('g1');
    await createGeraetBestand('ffnd', 'g1', srf, 4);
    expect(buchungen()[0]).toMatchObject({ createdByName: 'max@example.org' });
  });

  it('lässt das Feld ohne Namen und E-Mail weg', async () => {
    managerGuard.mockResolvedValue({ user: { id: 'u1', groups: ['ffnd'] } });
    putGeraet('g1');
    await createGeraetBestand('ffnd', 'g1', srf, 4);
    expect(buchungen()[0]).not.toHaveProperty('createdByName');
  });
});

describe('createGeraetBestand', () => {
  it('legt den Lagerort an und bucht die Anfangsmenge als Inventur', async () => {
    putGeraet('g1', { bestandGesamt: 2 });
    putBestand('b0', 'g1', lager, 2);
    const { id } = await createGeraetBestand('ffnd', 'g1', { ...srf, fahrzeug: ' SRF ' }, 4);
    expect(bestand(id)).toMatchObject({
      geraetId: 'g1',
      lagerortKey: 'fahrzeug|srf|gr 2',
      lagerort: { art: 'fahrzeug', fahrzeug: 'SRF', laderaum: 'GR 2' },
      anzahl: 4,
    });
    expect(geraet('g1')!.bestandGesamt).toBe(6);
    expect(sumOfBestaende('g1')).toBe(6);
    expect(buchungen()).toEqual([
      expect.objectContaining({ art: 'inventur', menge: 4, bestandId: id, geraetId: 'g1', createdBy: 'u1' }),
    ]);
  });

  it('holt einen archivierten Lagerort mit demselben Schlüssel zurück', async () => {
    putGeraet('g1');
    fake.put(`${G}/geraetBestand/alt`, {
      geraetId: 'g1',
      lagerort: srf,
      lagerortKey: lagerortKey(srf),
      anzahl: 0,
      archiviert: true,
    });
    await expect(createGeraetBestand('ffnd', 'g1', srf, 2)).resolves.toEqual({ id: 'alt' });
    expect(bestand('alt')).toMatchObject({ anzahl: 2 });
    expect(bestand('alt')).not.toHaveProperty('archiviert');
    expect(fake.list(`${G}/geraetBestand`)).toHaveLength(1);
    expect(geraet('g1')!.bestandGesamt).toBe(2);
  });

  it('bucht nichts bei Anfangsmenge 0', async () => {
    putGeraet('g1');
    await createGeraetBestand('ffnd', 'g1', srf);
    expect(buchungen()).toHaveLength(0);
  });

  it('lehnt einen doppelten Lagerort desselben Artikels ab', async () => {
    putGeraet('g1');
    putBestand('b1', 'g1', srf, 1);
    await expect(
      createGeraetBestand('ffnd', 'g1', { art: 'fahrzeug', fahrzeug: 'srf', laderaum: 'GR  2' }),
    ).rejects.toThrow(/exists/i);
  });

  it('lehnt einen unbekannten Artikel und einen leeren Lagerort ab', async () => {
    await expect(createGeraetBestand('ffnd', 'fehlt', srf)).rejects.toThrow(/not found/i);
    putGeraet('g1');
    await expect(createGeraetBestand('ffnd', 'g1', { art: 'fahrzeug' })).rejects.toThrow();
    await expect(createGeraetBestand('ffnd', 'g1', { art: 'quatsch' } as never)).rejects.toThrow();
  });

  it('legt einen Container als Lagerort an und nimmt dessen Bezeichnung', async () => {
    putGeraet('g1');
    putGeraet('c1', { bezeichnung: 'Ölsperren 1', kategorie: 'Container' });
    const { id } = await createGeraetBestand(
      'ffnd',
      'g1',
      { art: 'container', containerId: 'c1', container: 'falscher Name', fahrzeug: 'SRF' } as never,
      3,
    );
    expect(bestand(id)).toMatchObject({
      lagerortKey: 'container|c1',
      lagerort: { art: 'container', containerId: 'c1', container: 'Ölsperren 1' },
      anzahl: 3,
    });
    expect(bestand(id)!.lagerort).not.toHaveProperty('fahrzeug');
  });

  it('lehnt einen Container ab, der keiner ist oder fehlt', async () => {
    putGeraet('g1');
    putGeraet('kein', { kategorie: 'Gerät' });
    await expect(
      createGeraetBestand('ffnd', 'g1', { art: 'container', containerId: 'kein' }),
    ).rejects.toThrow(/container/i);
    await expect(
      createGeraetBestand('ffnd', 'g1', { art: 'container', containerId: 'fehlt' }),
    ).rejects.toThrow(/container/i);
    await expect(createGeraetBestand('ffnd', 'g1', { art: 'container' })).rejects.toThrow(
      /container/i,
    );
  });

  it('lehnt einen Container als eigenen Lagerort ab', async () => {
    putGeraet('c1', { bezeichnung: 'Ölsperren 1', kategorie: 'Container' });
    await expect(
      createGeraetBestand('ffnd', 'c1', { art: 'container', containerId: 'c1' }),
    ).rejects.toThrow(/container/i);
  });

  it('lehnt eine unsinnige Anfangsmenge ab', async () => {
    putGeraet('g1');
    await expect(createGeraetBestand('ffnd', 'g1', srf, 1e308)).rejects.toThrow(/anzahl/);
    await expect(createGeraetBestand('ffnd', 'g1', srf, -1)).rejects.toThrow(/anzahl/);
    expect(fake.list(`${G}/geraetBestand`)).toHaveLength(0);
  });
});

describe('updateGeraetBestand', () => {
  it('ändert den Lagerort samt Schlüssel und lässt Menge und Buchungen stehen', async () => {
    putGeraet('g1', { bestandGesamt: 3 });
    putBestand('b1', 'g1', srf, 3);
    await updateGeraetBestand('ffnd', 'b1', { art: 'raum', standort: ' Feuerwehrhaus ', raum: 'Lager' });
    expect(bestand('b1')).toMatchObject({
      geraetId: 'g1',
      lagerortKey: 'raum|feuerwehrhaus|lager',
      lagerort: { art: 'raum', standort: 'Feuerwehrhaus', raum: 'Lager' },
      anzahl: 3,
      updatedBy: 'u1',
    });
    expect(geraet('g1')!.bestandGesamt).toBe(3);
    expect(buchungen()).toHaveLength(0);
  });

  it('nimmt beim Container dessen Bezeichnung', async () => {
    putGeraet('g1');
    putGeraet('c1', { bezeichnung: 'Ölsperren 1', kategorie: 'Container' });
    putBestand('b1', 'g1', srf, 1);
    await updateGeraetBestand('ffnd', 'b1', { art: 'container', containerId: 'c1' });
    expect(bestand('b1')).toMatchObject({
      lagerortKey: 'container|c1',
      lagerort: { art: 'container', containerId: 'c1', container: 'Ölsperren 1' },
    });
  });

  it('lehnt einen Lagerort ab, den der Artikel schon hat — nicht aber den eigenen', async () => {
    putGeraet('g1');
    putBestand('b1', 'g1', srf, 1);
    putBestand('b2', 'g1', lager, 1);
    await expect(updateGeraetBestand('ffnd', 'b1', lager)).rejects.toThrow(/exists/i);
    await expect(
      updateGeraetBestand('ffnd', 'b1', { ...srf, bemerkung: 'oben links' }),
    ).resolves.toEqual({ id: 'b1' });
    expect(bestand('b1')!.lagerort).toMatchObject({ bemerkung: 'oben links' });
  });

  it('lehnt einen unbekannten Lagerort und einen Container als eigenen Lagerort ab', async () => {
    await expect(updateGeraetBestand('ffnd', 'fehlt', srf)).rejects.toThrow(/not found/i);
    putGeraet('c1', { kategorie: 'Container' });
    putBestand('b1', 'c1', srf, 1);
    await expect(
      updateGeraetBestand('ffnd', 'b1', { art: 'container', containerId: 'c1' }),
    ).rejects.toThrow(/container/i);
  });
});

describe('deleteGeraetBestand', () => {
  it('löscht einen Lagerort und bucht den Restbestand aus', async () => {
    putGeraet('g1', { bestandGesamt: 5, mindestbestand: 4 });
    putBestand('b1', 'g1', srf, 2);
    putBestand('b2', 'g1', lager, 3);
    await expect(deleteGeraetBestand('ffnd', 'b1')).resolves.toEqual({
      id: 'b1',
      deleted: true,
    });
    expect(bestand('b1')).toBeUndefined();
    expect(geraet('g1')!.bestandGesamt).toBe(3);
    expect(sumOfBestaende('g1')).toBe(3);
    expect(buchungen()).toEqual([
      expect.objectContaining({
        art: 'inventur',
        menge: -2,
        bestandId: 'b1',
        bemerkung: 'Lagerort gelöscht: SRF · GR 2',
      }),
    ]);
    // Das Ausbuchen unterschreitet den Mindestbestand — wie jede Buchung.
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('bucht bei leerem Lagerort nichts', async () => {
    putGeraet('g1');
    putBestand('b1', 'g1', srf, 0);
    await deleteGeraetBestand('ffnd', 'b1');
    expect(bestand('b1')).toBeUndefined();
    expect(buchungen()).toHaveLength(0);
  });

  it('archiviert einen Lagerort, aus dem im Einsatz verbraucht wurde', async () => {
    putGeraet('g1', { bestandGesamt: 2 });
    putBestand('b1', 'g1', srf, 2);
    fake.put(`${G}/geraetBuchung/v1`, {
      geraetId: 'g1',
      bestandId: 'b1',
      art: 'verbrauch',
      menge: -1,
      firecallId: 'fc1',
      einsatzEintragId: 'e1',
      createdAt: '2026-10-01T00:00:00.000Z',
      createdBy: 'u2',
    });
    await expect(deleteGeraetBestand('ffnd', 'b1')).resolves.toEqual({
      id: 'b1',
      deleted: false,
    });
    expect(bestand('b1')).toMatchObject({ anzahl: 0, archiviert: true });
    expect(geraet('g1')!.bestandGesamt).toBe(0);
  });

  it('lehnt einen unbekannten Lagerort ab', async () => {
    await expect(deleteGeraetBestand('ffnd', 'fehlt')).rejects.toThrow(/not found/i);
  });
});

describe('bookGeraetBestand', () => {
  beforeEach(() => {
    putGeraet('g1', { bestandGesamt: 4, mindestbestand: 5, nachbestellenSeit: '2026-09-01T00:00:00.000Z' });
    putBestand('b1', 'g1', srf, 1);
    putBestand('b2', 'g1', lager, 3);
  });

  it('bucht einen Zugang und löscht die Nachbestellung beim Wiederauffüllen', async () => {
    await bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b2', menge: 10, bemerkung: 'Lieferung' });
    expect(bestand('b2')!.anzahl).toBe(13);
    expect(geraet('g1')!.bestandGesamt).toBe(14);
    expect(geraet('g1')!.nachbestellenSeit).toBeUndefined();
    expect(buchungen()).toEqual([
      expect.objectContaining({ art: 'zugang', menge: 10, bestandId: 'b2', bemerkung: 'Lieferung' }),
    ]);
  });

  it('bucht eine Umbuchung ohne Änderung des Gesamtbestands', async () => {
    await bookGeraetBestand('ffnd', { art: 'umbuchung', bestandId: 'b2', zielBestandId: 'b1', menge: 2 });
    expect(bestand('b2')!.anzahl).toBe(1);
    expect(bestand('b1')!.anzahl).toBe(3);
    expect(geraet('g1')!.bestandGesamt).toBe(4);
    expect(buchungen()).toEqual([
      expect.objectContaining({ art: 'umbuchung', menge: -2, bestandId: 'b2', zielBestandId: 'b1' }),
    ]);
  });

  it('lehnt eine Umbuchung auf einen Lagerort eines anderen Artikels ab', async () => {
    putGeraet('g2');
    putBestand('x1', 'g2', srf, 0);
    await expect(
      bookGeraetBestand('ffnd', { art: 'umbuchung', bestandId: 'b2', zielBestandId: 'x1', menge: 1 }),
    ).rejects.toThrow();
    await expect(
      bookGeraetBestand('ffnd', { art: 'umbuchung', bestandId: 'b2', zielBestandId: 'b2', menge: 1 }),
    ).rejects.toThrow();
    expect(buchungen()).toHaveLength(0);
  });

  it('setzt bei der Inventur den Ist-Wert und meldet das Unterschreiten nach dem Commit', async () => {
    putGeraet('g1', { bestandGesamt: 6, mindestbestand: 5 });
    putBestand('b2', 'g1', lager, 5);
    notifyMock.mockImplementation(async () => {
      // Erst nach dem Commit: Die Mail sieht den neuen Stand.
      expect(geraet('g1')!.bestandGesamt).toBe(3);
      return true;
    });
    await bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b2', istWert: 2 });
    expect(bestand('b2')!.anzahl).toBe(2);
    expect(geraet('g1')!.nachbestellenSeit).toEqual(expect.any(String));
    expect(buchungen()).toEqual([expect.objectContaining({ art: 'inventur', menge: -3 })]);
    expect(notifyMock).toHaveBeenCalledWith({
      groupId: 'ffnd',
      items: [
        expect.objectContaining({ geraetId: 'g1', bestandGesamt: 3, mindestbestand: 5 }),
      ],
    });
  });

  it('meldet nicht erneut, wenn der Bestand schon darunter lag', async () => {
    await bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b2', istWert: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
    expect(geraet('g1')!.nachbestellenSeit).toBe('2026-09-01T00:00:00.000Z');
  });

  it('lehnt unsinnige Mengen ab', async () => {
    await expect(bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 0 })).rejects.toThrow();
    await expect(bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: -1 })).rejects.toThrow();
    await expect(
      bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b1', istWert: Number.NaN }),
    ).rejects.toThrow();
    await expect(
      bookGeraetBestand('ffnd', { art: 'verbrauch', bestandId: 'b1', menge: 1 } as never),
    ).rejects.toThrow();
    await expect(
      bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 1e308 }),
    ).rejects.toThrow();
    await expect(
      bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b1', istWert: 1e308 }),
    ).rejects.toThrow();
    await expect(
      bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b1', istWert: -1 }),
    ).rejects.toThrow();
    expect(buchungen()).toHaveLength(0);
  });

  it('bucht Kommazahlen (Ölbindemittel in kg)', async () => {
    await bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b2', menge: 2.5 });
    expect(bestand('b2')!.anzahl).toBe(5.5);
    await bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b2', istWert: 7.5 });
    expect(bestand('b2')!.anzahl).toBe(7.5);
    expect(geraet('g1')!.bestandGesamt).toBe(8.5);
  });

  it('lehnt einen unbekannten Lagerort ab', async () => {
    await expect(bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'fehlt', menge: 1 })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('syncGeraetVerbrauch', () => {
  const E = 'call/fc1/geraetEinsatz';

  function putEintrag(id: string, data: Record<string, unknown>) {
    fake.put(`${E}/${id}`, {
      groupId: 'ffnd',
      geraetId: 'g1',
      geraetName: 'Bindevlies Economy',
      art: 'verbraucht',
      bestandId: 'b1',
      menge: 3,
      zeitpunkt: '2026-10-04T10:00:00.000Z',
      createdAt: '2026-10-04T10:00:00.000Z',
      createdBy: 'u2',
      ...data,
    });
  }

  beforeEach(() => {
    putGeraet('g1', { bestandGesamt: 10, mindestbestand: 5 });
    putBestand('b1', 'g1', srf, 4);
    putBestand('b2', 'g1', lager, 6);
  });

  it('prüft die Einsatzberechtigung mit Schreibrecht und Gruppenmitgliedschaft', async () => {
    firecallGuard.mockRejectedValue(new Error('not authorized'));
    putEintrag('e1', {});
    await expect(syncGeraetVerbrauch('fc1', 'e1')).rejects.toThrow('not authorized');
    // Ein Gast mit Schreibrecht könnte die Gruppe am Einsatz umschreiben und
    // im Lager einer fremden Gruppe buchen — darum nur Gruppenmitglieder.
    expect(firecallGuard).toHaveBeenCalledWith('fc1', {
      requireWrite: true,
      requireGroupMember: true,
    });
    expect(buchungen()).toHaveLength(0);
  });

  it('übergeht Protokolleinträge mit derselben einsatzEintragId', async () => {
    putEintrag('e1', {});
    fake.put(`${G}/geraetBuchung/p1`, {
      geraetId: 'g1',
      art: 'zuordnung',
      menge: 0,
      firecallId: 'fc1',
      einsatzEintragId: 'e1',
    });
    await syncGeraetVerbrauch('fc1', 'e1');
    expect(bestand('b1')!.anzahl).toBe(1);
    expect(buchungen().filter((b) => b.art === 'verbrauch')).toEqual([
      expect.objectContaining({ bestandId: 'b1', menge: -3, createdByName: 'Max Mustermann' }),
    ]);
  });

  describe('erwarteter Stand des Eintrags', () => {
    it('lehnt ab, solange ein gelöschter Eintrag am Server noch steht', async () => {
      putEintrag('e1', { syncRev: 1 });
      await syncGeraetVerbrauch('fc1', 'e1', { syncRev: 1 });
      await expect(syncGeraetVerbrauch('fc1', 'e1', { deleted: true })).rejects.toThrow(
        /expected state/,
      );
      expect(bestand('b1')!.anzahl).toBe(1);

      fake.docs.delete(`${E}/e1`);
      await syncGeraetVerbrauch('fc1', 'e1', { deleted: true });
      expect(bestand('b1')!.anzahl).toBe(4);
    });

    it('lehnt einen älteren Stand ab und bucht die Änderung, sobald sie da ist', async () => {
      putEintrag('e1', { syncRev: 1 });
      await syncGeraetVerbrauch('fc1', 'e1', { syncRev: 1 });
      await expect(syncGeraetVerbrauch('fc1', 'e1', { syncRev: 2 })).rejects.toThrow(
        /expected state/,
      );
      expect(fake.get(`${E}/e1`)!.gebucht).toBe(true);

      putEintrag('e1', { syncRev: 2, menge: 5, gebucht: false });
      await syncGeraetVerbrauch('fc1', 'e1', { syncRev: 2 });
      expect(bestand('b1')!.anzahl).toBe(-1);
      expect(fake.get(`${E}/e1`)!.gebucht).toBe(true);
    });

    it('lehnt ab, solange ein neuer Eintrag am Server fehlt', async () => {
      await expect(syncGeraetVerbrauch('fc1', 'e1', { syncRev: 1 })).rejects.toThrow(
        /expected state/,
      );
      expect(buchungen()).toHaveLength(0);
    });

    it('bucht einen neueren Stand als erwartet (von einem anderen Gerät)', async () => {
      putEintrag('e1', { syncRev: 9 });
      await expect(syncGeraetVerbrauch('fc1', 'e1', { syncRev: 5 })).resolves.toEqual({
        deltas: 1,
      });
    });

    it('lehnt eine unbekannte Erwartung ab', async () => {
      putEintrag('e1', {});
      await expect(
        syncGeraetVerbrauch('fc1', 'e1', { syncRev: 'x' } as never),
      ).rejects.toThrow(/expectation/);
    });
  });

  it('bucht bei einem Artikel ohne Verbrauchsmaterial nichts ab', async () => {
    putGeraet('g1', { bestandGesamt: 10, verbrauchsmaterial: false });
    putEintrag('e1', {});
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });
    expect(buchungen()).toHaveLength(0);
    expect(bestand('b1')!.anzahl).toBe(4);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('bucht bei einem deaktivierten Artikel nichts Neues ab', async () => {
    putGeraet('g1', { bestandGesamt: 10, mindestbestand: 5, active: false });
    putEintrag('e1', {});
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });
    expect(bestand('b1')!.anzahl).toBe(4);
  });

  it('lässt einen gebuchten Verbrauch stehen, wenn der Artikel kein Verbrauchsmaterial mehr ist', async () => {
    putEintrag('e1', {});
    await syncGeraetVerbrauch('fc1', 'e1');
    putGeraet('g1', { bestandGesamt: 7, verbrauchsmaterial: false });
    // Nur die Bemerkung geändert, der Eintrag bleibt ein Verbrauch.
    putEintrag('e1', { bemerkung: 'nachgetragen', gebucht: false });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });
    expect(bestand('b1')!.anzahl).toBe(1);
    expect(fake.get(`${E}/e1`)!.gebucht).toBe(true);

    // Erhöhen bucht nichts nach, Löschen storniert weiterhin.
    putEintrag('e1', { menge: 8 });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });
    fake.docs.delete(`${E}/e1`);
    await syncGeraetVerbrauch('fc1', 'e1');
    expect(bestand('b1')!.anzahl).toBe(4);
  });

  it('lehnt eine unsinnige Menge im Eintrag ab', async () => {
    putEintrag('e1', { menge: 1e308 });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).rejects.toThrow(/invalid menge/);
    putEintrag('e2', { menge: -2 });
    await expect(syncGeraetVerbrauch('fc1', 'e2')).rejects.toThrow(/invalid menge/);
    expect(buchungen()).toHaveLength(0);
    expect(bestand('b1')!.anzahl).toBe(4);
    expect(geraet('g1')!.bestandGesamt).toBe(10);
  });

  it('bucht den Verbrauch ab und markiert den Eintrag als gebucht', async () => {
    putEintrag('e1', {});
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 1 });
    expect(bestand('b1')!.anzahl).toBe(1);
    expect(geraet('g1')!.bestandGesamt).toBe(7);
    expect(fake.get(`${E}/e1`)!.gebucht).toBe(true);
    expect(buchungen()).toEqual([
      expect.objectContaining({
        art: 'verbrauch',
        menge: -3,
        bestandId: 'b1',
        geraetId: 'g1',
        firecallId: 'fc1',
        einsatzEintragId: 'e1',
        createdBy: 'u1',
      }),
    ]);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('ist idempotent — ein zweiter Aufruf bucht nichts', async () => {
    putEintrag('e1', {});
    await syncGeraetVerbrauch('fc1', 'e1');
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });
    expect(buchungen()).toHaveLength(1);
    expect(bestand('b1')!.anzahl).toBe(1);
  });

  it('bucht bei geänderter Menge die Differenz nach', async () => {
    putEintrag('e1', {});
    await syncGeraetVerbrauch('fc1', 'e1');
    putEintrag('e1', { menge: 5 });
    await syncGeraetVerbrauch('fc1', 'e1');
    expect(bestand('b1')!.anzahl).toBe(-1);
    expect(geraet('g1')!.bestandGesamt).toBe(5);
    expect(buchungen().map((b) => [b.art, b.menge])).toEqual([
      ['verbrauch', -3],
      ['verbrauch', -2],
    ]);
  });

  it('bucht bei geändertem Lagerort um (Storno und Verbrauch)', async () => {
    putEintrag('e1', {});
    await syncGeraetVerbrauch('fc1', 'e1');
    putEintrag('e1', { bestandId: 'b2' });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 2 });
    expect(bestand('b1')!.anzahl).toBe(4);
    expect(bestand('b2')!.anzahl).toBe(3);
    expect(geraet('g1')!.bestandGesamt).toBe(7);
    expect(sumOfBestaende('g1')).toBe(7);
  });

  it('storniert den Verbrauch eines gelöschten Eintrags', async () => {
    putEintrag('e1', {});
    await syncGeraetVerbrauch('fc1', 'e1');
    fake.docs.delete(`${E}/e1`);
    await syncGeraetVerbrauch('fc1', 'e1');
    expect(bestand('b1')!.anzahl).toBe(4);
    expect(geraet('g1')!.bestandGesamt).toBe(10);
    expect(buchungen().map((b) => [b.art, b.menge])).toEqual([
      ['verbrauch', -3],
      ['storno', 3],
    ]);
  });

  it('holt einen archivierten Lagerort zurück, wenn dorthin zurückgebucht wird', async () => {
    putEintrag('e1', {});
    await syncGeraetVerbrauch('fc1', 'e1');
    await deleteGeraetBestand('ffnd', 'b1');
    expect(bestand('b1')).toMatchObject({ archiviert: true, anzahl: 0 });
    fake.docs.delete(`${E}/e1`);
    await syncGeraetVerbrauch('fc1', 'e1');
    expect(bestand('b1')!.anzahl).toBe(3);
    expect(bestand('b1')).not.toHaveProperty('archiviert');
  });

  it('bucht bei einem nur zugeordneten Gerät nichts ab', async () => {
    putEintrag('e1', { art: 'zugeordnet' });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });
    expect(buchungen()).toHaveLength(0);
    expect(geraet('g1')!.bestandGesamt).toBe(10);
  });

  it('meldet das Unterschreiten des Mindestbestands genau einmal', async () => {
    putEintrag('e1', { menge: 6 });
    await syncGeraetVerbrauch('fc1', 'e1');
    expect(geraet('g1')!.nachbestellenSeit).toEqual(expect.any(String));
    expect(notifyMock).toHaveBeenCalledOnce();
    expect(notifyMock).toHaveBeenCalledWith({
      groupId: 'ffnd',
      firecallId: 'fc1',
      firecallName: 'Ölspur B50',
      items: [expect.objectContaining({ geraetId: 'g1', bestandGesamt: 4, mindestbestand: 5 })],
    });

    putEintrag('e2', { menge: 1 });
    await syncGeraetVerbrauch('fc1', 'e2');
    expect(notifyMock).toHaveBeenCalledOnce();
  });

  it('lässt die Buchung stehen, wenn die Mail scheitert', async () => {
    notifyMock.mockRejectedValue(new Error('gmail down'));
    putEintrag('e1', { menge: 6 });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 1 });
    expect(geraet('g1')!.bestandGesamt).toBe(4);
  });

  it('lehnt einen Eintrag einer fremden Gruppe ab', async () => {
    putEintrag('e1', { groupId: 'andere' });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).rejects.toThrow(/group/i);
    expect(buchungen()).toHaveLength(0);
  });

  it('lehnt einen Lagerort eines anderen Artikels ab', async () => {
    putGeraet('g2');
    putBestand('x1', 'g2', srf, 5);
    putEintrag('e1', { bestandId: 'x1' });
    await expect(syncGeraetVerbrauch('fc1', 'e1')).rejects.toThrow();
    expect(bestand('x1')!.anzahl).toBe(5);
  });

  it('lehnt eine ID mit Schrägstrich ab', async () => {
    await expect(syncGeraetVerbrauch('fc1', '../x')).rejects.toThrow();
  });
});

// --- Import -----------------------------------------------------------------

const C = GERAET_EXPORT_COLUMNS;
const HEADER = [
  C.externeId,
  C.bezeichnung,
  C.inventarNr,
  C.kategorie,
  C.materialTyp,
  C.status,
  C.bemerkung,
  C.lagerort,
  C.fahrzeug,
  C.laderaum,
  C.standort,
  C.raum,
  C.anzahl,
];

interface Row {
  id: string;
  bezeichnung?: string;
  inventarNr?: string;
  kategorie?: string;
  materialTyp?: string;
  status?: string;
  bemerkung?: string;
  lagerort?: GeraetLagerort;
  anzahl?: number;
}

/** Der Export kennt keinen Container als Lagerort — der entsteht nur in der App. */
const EXPORT_LAGERORT: Partial<Record<GeraetLagerort['art'], string>> = {
  fahrzeug: 'Fahrzeug',
  raum: 'Raum',
  set: 'Set-Artikel',
};

function rowsOf(rows: Row[]): string[][] {
  return [
    HEADER,
    ...rows.map((r) => [
      r.id,
      r.bezeichnung ?? `Artikel ${r.id}`,
      r.inventarNr ?? '',
      r.kategorie ?? 'Gerät',
      r.materialTyp ?? 'Massenartikel',
      r.status ?? 'aktiv',
      r.bemerkung ?? '',
      r.lagerort ? (EXPORT_LAGERORT[r.lagerort.art] ?? '') : '',
      r.lagerort?.fahrzeug ?? '',
      r.lagerort?.laderaum ?? '',
      r.lagerort?.standort ?? '',
      r.lagerort?.raum ?? '',
      r.anzahl === undefined ? '' : String(r.anzahl),
    ]),
  ];
}

function file(rows: Row[]): string {
  return Buffer.from(JSON.stringify(rowsOf(rows))).toString('base64');
}

describe('previewGeraetImport', () => {
  it('liefert den Plan und die Meldungen, ohne zu schreiben', async () => {
    const plan = await previewGeraetImport(
      'ffnd',
      file([
        { id: '100', lagerort: srf, anzahl: 3 },
        { id: '100', lagerort: lager, anzahl: 2 },
        { id: '', bezeichnung: 'ohne ID' },
      ]),
    );
    expect(plan.create.map((a) => a.externeId)).toEqual(['100']);
    expect(plan.bestandCreate).toHaveLength(2);
    expect(plan.errors).toEqual([expect.stringContaining('keine ID')]);
    expect(fake.docs.size).toBe(0);
  });

  it('nimmt auch eine Data-URL an', async () => {
    const plan = await previewGeraetImport(
      'ffnd',
      `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${file([{ id: '1' }])}`,
    );
    expect(plan.create).toHaveLength(1);
  });

  it('lehnt eine zu große Datei ab', async () => {
    await expect(previewGeraetImport('ffnd', 'A'.repeat(8 * 1024 * 1024))).rejects.toThrow(
      /too large/i,
    );
  });

  it('erkennt Buchungen seit dem letzten Import als Abweichung', async () => {
    putGeraet('100', { externeId: '100', bezeichnung: 'Artikel 100', bestandGesamt: 2, importedAt: '2026-09-01T00:00:00.000Z' });
    putBestand('b1', '100', srf, 2);
    // Die Import-Buchung selbst zählt nicht, der Verbrauch danach schon.
    fake.put(`${G}/geraetBuchung/k0`, { geraetId: '100', bestandId: 'b1', art: 'import', menge: 3, createdAt: '2026-09-01T00:00:00.000Z' });
    fake.put(`${G}/geraetBuchung/k1`, { geraetId: '100', bestandId: 'b1', art: 'verbrauch', menge: -1, createdAt: '2026-09-15T00:00:00.000Z' });

    const plan = await previewGeraetImport('ffnd', file([{ id: '100', lagerort: srf, anzahl: 3 }]));
    expect(plan.deviations).toEqual([
      expect.objectContaining({ geraetId: '100', bestandId: 'b1', current: 2, imported: 3 }),
    ]);
    expect(plan.bestandUpdate).toHaveLength(0);
  });
});

describe('importGeraete', () => {
  it('legt beim Erstimport Artikel, Bestände und Import-Buchungen an', async () => {
    const summary = await importGeraete(
      'ffnd',
      file([
        { id: '100', bezeichnung: 'Bindevlies Economy', kategorie: 'Verbrauchsmaterial', lagerort: srf, anzahl: 3 },
        { id: '100', lagerort: lager, anzahl: 7 },
        { id: '200', bezeichnung: 'Kupplungsschlüssel', status: 'inaktiv' },
      ]),
      [],
    );
    expect(summary).toMatchObject({ created: 2, bestandCreated: 2, inactive: 1 });

    const g = geraet('100')!;
    expect(g).toMatchObject({
      externeId: '100',
      bezeichnung: 'Bindevlies Economy',
      verbrauchsmaterial: true,
      bestandGesamt: 10,
      active: true,
      createdBy: 'u1',
      importedAt: expect.any(String),
    });
    expect(geraet('200')).toMatchObject({ active: false, bestandGesamt: 0, verbrauchsmaterial: false });
    expect(sumOfBestaende('100')).toBe(10);
    expect(buchungen().map((b) => [b.art, b.menge, b.geraetId])).toEqual(
      expect.arrayContaining([
        ['import', 3, '100'],
        ['import', 7, '100'],
      ]),
    );
  });

  it('übernimmt beim Folgeimport ohne Buchungen Stammdaten und Bestand', async () => {
    putGeraet('100', {
      externeId: '100',
      bezeichnung: 'Alt',
      bemerkung: 'weg damit',
      verbrauchsmaterial: true,
      mindestbestand: 5,
      bestandGesamt: 3,
      importedAt: '2026-09-01T00:00:00.000Z',
    });
    putBestand('b1', '100', srf, 3);

    const summary = await importGeraete(
      'ffnd',
      file([{ id: '100', bezeichnung: 'Neu', lagerort: srf, anzahl: 8 }]),
      [],
    );
    expect(summary).toMatchObject({ updated: 1, bestandUpdated: 1 });
    const g = geraet('100')!;
    expect(g.bezeichnung).toBe('Neu');
    expect(g.bemerkung).toBeUndefined();
    // Händisch gepflegt — bleibt.
    expect(g.verbrauchsmaterial).toBe(true);
    expect(g.mindestbestand).toBe(5);
    expect(g.bestandGesamt).toBe(8);
    expect(g.importedAt).not.toBe('2026-09-01T00:00:00.000Z');
    expect(bestand('b1')!.anzahl).toBe(8);
    expect(buchungen()).toEqual([expect.objectContaining({ art: 'import', menge: 5, bestandId: 'b1' })]);
  });

  it('meldet beim Import ein Unterschreiten gesammelt in einer Mail', async () => {
    putGeraet('100', { externeId: '100', bezeichnung: 'Artikel 100', mindestbestand: 5, bestandGesamt: 6, importedAt: '2026-09-01T00:00:00.000Z' });
    putBestand('b1', '100', srf, 6);
    await importGeraete('ffnd', file([{ id: '100', lagerort: srf, anzahl: 2 }]), []);
    expect(geraet('100')!.nachbestellenSeit).toEqual(expect.any(String));
    expect(notifyMock).toHaveBeenCalledOnce();
    expect(notifyMock).toHaveBeenCalledWith({
      groupId: 'ffnd',
      items: [expect.objectContaining({ geraetId: '100', bestandGesamt: 2 })],
    });
  });

  describe('mit Buchungen seit dem letzten Import', () => {
    beforeEach(() => {
      putGeraet('100', { externeId: '100', bezeichnung: 'Artikel 100', bestandGesamt: 2, importedAt: '2026-09-01T00:00:00.000Z' });
      putBestand('b1', '100', srf, 2);
      fake.put(`${G}/geraetBuchung/k1`, {
        geraetId: '100',
        bestandId: 'b1',
        art: 'verbrauch',
        menge: -1,
        createdAt: '2026-09-15T00:00:00.000Z',
      });
    });

    const rows: Row[] = [
      { id: '100', lagerort: srf, anzahl: 3 },
      { id: '100', lagerort: lager, anzahl: 4 },
    ];

    it('überschreibt den Bestand nicht ohne Zustimmung und behält den Importzeitpunkt', async () => {
      const summary = await importGeraete('ffnd', file(rows), []);
      expect(summary).toMatchObject({ deviationsAccepted: 0, deviationsRejected: 2 });
      expect(bestand('b1')!.anzahl).toBe(2);
      expect(fake.list(`${G}/geraetBestand`)).toHaveLength(1);
      expect(geraet('100')!.bestandGesamt).toBe(2);
      // Sonst überschriebe der nächste Import den verworfenen Wert still.
      expect(geraet('100')!.importedAt).toBe('2026-09-01T00:00:00.000Z');
    });

    it('übernimmt zugestimmte Abweichungen als Inventur, auch neue Lagerorte', async () => {
      const summary = await importGeraete('ffnd', file(rows), [
        deviationKey({ geraetId: '100', lagerortKey: lagerortKey(srf) }),
        deviationKey({ geraetId: '100', lagerortKey: lagerortKey(lager) }),
      ]);
      expect(summary).toMatchObject({ deviationsAccepted: 2, deviationsRejected: 0 });
      expect(bestand('b1')!.anzahl).toBe(3);
      const neu = fake
        .list(`${G}/geraetBestand`)
        .find((b) => (b as { lagerortKey?: string }).lagerortKey === lagerortKey(lager)) as
        | Record<string, unknown>
        | undefined;
      expect(neu).toMatchObject({ geraetId: '100', anzahl: 4, lagerort: lager });
      expect(geraet('100')!.bestandGesamt).toBe(7);
      expect(sumOfBestaende('100')).toBe(7);
      expect(buchungen().filter((b) => b.art === 'inventur').map((b) => b.menge).sort()).toEqual([1, 4]);
      expect(geraet('100')!.importedAt).not.toBe('2026-09-01T00:00:00.000Z');
    });
  });

  it('schreibt in Batches von höchstens 450 Operationen', async () => {
    const rows: Row[] = [];
    for (let i = 1; i <= 300; i++) rows.push({ id: String(i), lagerort: srf, anzahl: 1 });
    const summary = await importGeraete('ffnd', file(rows), []);
    expect(summary.created).toBe(300);
    expect(fake.list(`${G}/geraet`)).toHaveLength(300);
    expect(fake.list(`${G}/geraetBestand`)).toHaveLength(300);
    expect(buchungen()).toHaveLength(300);
    expect(fake.batchSizes.length).toBeGreaterThan(1);
    expect(Math.max(...fake.batchSizes)).toBeLessThanOrEqual(450);
  });

  it('lehnt unbrauchbare Zustimmungen ab', async () => {
    await expect(importGeraete('ffnd', file([{ id: '1' }]), 'x' as never)).rejects.toThrow();
  });
});

// --- Sets --------------------------------------------------------------------

function putSet(id: string, data: Record<string, unknown> = {}) {
  fake.put(`${G}/geraetSet/${id}`, {
    name: 'Ölspur',
    codes: [],
    inhalt: [{ geraetId: 'besen' }],
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u0',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u0',
    ...data,
  });
}

function geraetSet(id: string) {
  return fake.get(`${G}/geraetSet/${id}`) as Record<string, unknown> | undefined;
}

function putSetArtikel() {
  putGeraet('besen', { bezeichnung: 'Besen', verbrauchsmaterial: false });
  putGeraet('binder', { bezeichnung: 'Ölbindemittel' });
  putGeraet('pumpe', { bezeichnung: 'Tauchpumpe', verbrauchsmaterial: false, barcodes: ['ABC123'] });
  putGeraet('kiste', {
    bezeichnung: 'Ölspur-Kiste',
    verbrauchsmaterial: false,
    materialTyp: 'Set-Artikel',
    barcodes: ['SET-1'],
  });
  putBestand('b-lager', 'binder', lager, 40);
  putBestand('p-lager', 'pumpe', lager, 1);
}

const validSet = {
  name: '  Ölspur ',
  codes: [' OEL ', 'oel'],
  inhalt: [{ geraetId: 'besen' }, { geraetId: 'binder', menge: 3, bestandId: 'b-lager' }],
  active: true,
};

describe('saveGeraetSet', () => {
  beforeEach(putSetArtikel);

  it('verlangt Gruppen-Admin oder Gerätemeister', async () => {
    managerGuard.mockRejectedValue(new Error('forbidden'));
    await expect(saveGeraetSet('ffnd', validSet)).rejects.toThrow('forbidden');
    expect(managerGuard).toHaveBeenCalledWith('ffnd');
    expect(fake.list(`${G}/geraetSet`)).toHaveLength(0);
  });

  it('legt ein Set an, normalisiert Codes und setzt Autor und Zeitpunkte', async () => {
    const { id } = await saveGeraetSet('ffnd', {
      ...validSet,
      sybosSetArtikelId: 'kiste',
      bemerkung: '  am SRF ',
    });
    expect(geraetSet(id)).toEqual({
      name: 'Ölspur',
      codes: ['OEL'],
      inhalt: [{ geraetId: 'besen' }, { geraetId: 'binder', menge: 3, bestandId: 'b-lager' }],
      active: true,
      sybosSetArtikelId: 'kiste',
      bemerkung: 'am SRF',
      createdAt: expect.any(String),
      createdBy: 'u1',
      updatedAt: expect.any(String),
      updatedBy: 'u1',
    });
  });

  it('ändert ein bestehendes Set und behält createdAt/createdBy', async () => {
    putSet('s1', { codes: ['ALT'] });
    await saveGeraetSet('ffnd', { ...validSet, id: 's1', active: false });
    expect(geraetSet('s1')).toMatchObject({
      name: 'Ölspur',
      codes: ['OEL'],
      active: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'u0',
      updatedBy: 'u1',
    });
  });

  it('löscht geleerte optionale Felder beim Ändern', async () => {
    putSet('s1', { sybosSetArtikelId: 'kiste', bemerkung: 'alt' });
    await saveGeraetSet('ffnd', { ...validSet, id: 's1', sybosSetArtikelId: '', bemerkung: ' ' });
    const s = geraetSet('s1')!;
    expect(s.sybosSetArtikelId).toBeUndefined();
    expect(s.bemerkung).toBeUndefined();
  });

  it('lehnt ein unbekanntes Set beim Ändern mit 404 ab', async () => {
    await expect(saveGeraetSet('ffnd', { ...validSet, id: 'weg' })).rejects.toThrow(/not found/);
    expect(fake.list(`${G}/geraetSet`)).toHaveLength(0);
  });

  it('prüft serverseitig mit validateGeraetSet', async () => {
    await expect(saveGeraetSet('ffnd', { ...validSet, codes: ['abc123'] })).rejects.toThrow(
      /codeCollision/,
    );
    putSet('s2', { name: 'Hochwasser', codes: ['HW-1'] });
    await expect(saveGeraetSet('ffnd', { ...validSet, codes: ['hw-1'] })).rejects.toThrow(
      /codeCollision/,
    );
    await expect(saveGeraetSet('ffnd', { ...validSet, name: ' ' })).rejects.toThrow(
      /nameMissing/,
    );
    await expect(
      saveGeraetSet('ffnd', { ...validSet, sybosSetArtikelId: 'pumpe' }),
    ).rejects.toThrow(/notSetArtikel/);
    expect(fake.list(`${G}/geraetSet`)).toHaveLength(1);
  });

  it('lehnt einen Lagerort eines anderen Artikels ab', async () => {
    await expect(
      saveGeraetSet('ffnd', {
        ...validSet,
        inhalt: [{ geraetId: 'binder', bestandId: 'p-lager' }],
      }),
    ).rejects.toThrow(/invalidBestand/);
  });

  it('lehnt einen archivierten Lagerort ab', async () => {
    fake.put(`${G}/geraetBestand/b-alt`, {
      geraetId: 'binder',
      lagerort: srf,
      lagerortKey: lagerortKey(srf),
      anzahl: 0,
      archiviert: true,
    });
    await expect(
      saveGeraetSet('ffnd', { ...validSet, inhalt: [{ geraetId: 'binder', bestandId: 'b-alt' }] }),
    ).rejects.toThrow(/invalidBestand/);
  });

  it('lehnt unsichere IDs ab', async () => {
    await expect(
      saveGeraetSet('ffnd', { ...validSet, inhalt: [{ geraetId: 'a/b' }] }),
    ).rejects.toThrow(/invalid geraetId/);
    await expect(saveGeraetSet('ffnd', { ...validSet, id: '..' })).rejects.toThrow(
      /invalid setId/,
    );
  });

  it('lehnt eine kaputte Eingabe ab', async () => {
    await expect(saveGeraetSet('ffnd', null as never)).rejects.toThrow(/invalid geraetSet/);
  });
});

describe('deleteGeraetSet', () => {
  it('verlangt Gruppen-Admin oder Gerätemeister', async () => {
    putSet('s1');
    managerGuard.mockRejectedValue(new Error('forbidden'));
    await expect(deleteGeraetSet('ffnd', 's1')).rejects.toThrow('forbidden');
    expect(managerGuard).toHaveBeenCalledWith('ffnd');
    expect(geraetSet('s1')).toBeDefined();
  });

  it('löscht das Set und lässt Einsatz-Einträge unberührt', async () => {
    putSet('s1');
    fake.put('call/fc1/geraetEinsatz/e1', {
      geraetId: 'besen',
      setId: 's1',
      setName: 'Ölspur',
      setZuordnungId: 'z1',
    });
    await expect(deleteGeraetSet('ffnd', 's1')).resolves.toEqual({ id: 's1' });
    expect(geraetSet('s1')).toBeUndefined();
    expect(fake.get('call/fc1/geraetEinsatz/e1')).toMatchObject({ setName: 'Ölspur' });
  });

  it('meldet ein unbekanntes Set mit 404', async () => {
    await expect(deleteGeraetSet('ffnd', 'weg')).rejects.toThrow(/not found/);
  });

  it('protokolliert nur an Artikeln, die es noch gibt', async () => {
    putGeraet('besen', { bezeichnung: 'Besen', verbrauchsmaterial: false });
    putSet('s1', {
      inhalt: [{ geraetId: 'besen' }, { geraetId: 'geloescht' }],
      sybosSetArtikelId: 'kiste-weg',
    });
    await deleteGeraetSet('ffnd', 's1');
    expect(geraetSet('s1')).toBeUndefined();
    expect(alleBuchungen().map((b) => [b.geraetId, b.art])).toEqual([['besen', 'set']]);
  });
});

// --- Chargen ----------------------------------------------------------------

describe('Chargen', () => {
  const chargeA = {
    id: 'cA',
    produktionsNummer: 'A',
    ablaufDatum: '2026-12-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u0',
  };
  const chargeB = {
    id: 'cB',
    produktionsNummer: 'B',
    ablaufDatum: '2027-06-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u0',
  };
  const chargeAlt = { ...chargeB, id: 'cX', produktionsNummer: 'X', archiviert: true };

  function putChargenBestand(
    id: string,
    lagerort: GeraetLagerort,
    anzahl: number,
    chargen?: Record<string, number>,
  ) {
    putBestand(id, 'g1', lagerort, anzahl);
    if (chargen) fake.put(`${G}/geraetBestand/${id}`, { ...bestand(id)!, chargen });
  }

  function chargenOf(geraetId: string) {
    return geraet(geraetId)!.chargen as Record<string, unknown>[];
  }

  describe('saveGeraet', () => {
    it('ignoriert chargen und prüft ablaufVorlaufTage', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      await saveGeraet('ffnd', { id: 'g1', chargen: [], ablaufVorlaufTage: 30 } as never);
      expect(geraet('g1')!.chargen).toEqual([chargeA]);
      expect(geraet('g1')!.ablaufVorlaufTage).toBe(30);

      await saveGeraet('ffnd', { id: 'g1', ablaufVorlaufTage: 1.5 });
      expect(geraet('g1')).not.toHaveProperty('ablaufVorlaufTage');
      await saveGeraet('ffnd', { id: 'g1', ablaufVorlaufTage: 0 });
      expect(geraet('g1')!.ablaufVorlaufTage).toBe(0);
      await saveGeraet('ffnd', { id: 'g1', ablaufVorlaufTage: 3651 });
      expect(geraet('g1')).not.toHaveProperty('ablaufVorlaufTage');
      await saveGeraet('ffnd', { id: 'g1', ablaufVorlaufTage: 10 });
      await saveGeraet('ffnd', { id: 'g1', ablaufVorlaufTage: null });
      expect(geraet('g1')).not.toHaveProperty('ablaufVorlaufTage');

      const { id } = await saveGeraet('ffnd', {
        bezeichnung: 'Neu',
        chargen: [chargeA],
        ablaufVorlaufTage: -1,
      } as never);
      expect(geraet(id)).not.toHaveProperty('chargen');
      expect(geraet(id)).not.toHaveProperty('ablaufVorlaufTage');
    });
  });

  describe('saveGeraetCharge', () => {
    it('legt eine Charge an, trimmt Texte und verwirft ungültige Daten', async () => {
      putGeraet('g1');
      const { id } = await saveGeraetCharge('ffnd', 'g1', {
        produktionsNummer: ' L-17 ',
        bezeichnung: '  ',
        ablaufDatum: '2027-02-30',
        einkaufsDatum: '2026-10-01',
        archiviert: true,
        createdBy: 'boese',
      } as never);
      expect(id).toEqual(expect.any(String));
      expect(chargenOf('g1')).toEqual([
        {
          id,
          produktionsNummer: 'L-17',
          einkaufsDatum: '2026-10-01',
          createdAt: expect.any(String),
          createdBy: 'u1',
        },
      ]);
      expect(geraet('g1')!.updatedBy).toBe('u1');
    });

    it('ändert eine bestehende Charge und behält Archiv und Ersteller', async () => {
      putGeraet('g1', { chargen: [chargeA, chargeB] });
      await saveGeraetCharge('ffnd', 'g1', {
        id: 'cA',
        produktionsNummer: 'A2',
        kommentar: 'nachgezählt',
        createdBy: 'boese',
      } as never);
      expect(chargenOf('g1')).toEqual([
        {
          id: 'cA',
          produktionsNummer: 'A2',
          kommentar: 'nachgezählt',
          createdAt: chargeA.createdAt,
          createdBy: 'u0',
        },
        chargeB,
      ]);
    });

    it('lehnt unbekannte Chargen, Geräte ohne Verbrauch und fremde Artikel ab', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      putGeraet('g2', { verbrauchsmaterial: false });
      await expect(saveGeraetCharge('ffnd', 'g1', { id: 'weg', produktionsNummer: 'x' })).rejects.toThrow(
        /not found/,
      );
      await expect(saveGeraetCharge('ffnd', 'g2', { produktionsNummer: 'x' })).rejects.toThrow();
      await expect(saveGeraetCharge('ffnd', 'fehlt', { produktionsNummer: 'x' })).rejects.toThrow(
        /not found/,
      );
      await expect(saveGeraetCharge('ffnd', 'a/b', { produktionsNummer: 'x' })).rejects.toThrow();
      managerGuard.mockRejectedValueOnce(new Error('forbidden'));
      await expect(saveGeraetCharge('ffnd', 'g1', { produktionsNummer: 'x' })).rejects.toThrow('forbidden');
      expect(chargenOf('g1')).toEqual([chargeA]);
    });
  });

  describe('saveGeraetCharge mit Zugang', () => {
    const unbestimmt = () =>
      fake
        .list(`${G}/geraetBestand`)
        .find((b) => (b as { lagerortKey?: string }).lagerortKey === 'unbestimmt') as
        | Record<string, unknown>
        | undefined;

    it('bucht die Mengen als Zugang je Lagerort und ohne Lagerort', async () => {
      putGeraet('g1', { bestandGesamt: 5 });
      putChargenBestand('b1', srf, 5);
      const { id } = await saveGeraetCharge('ffnd', 'g1', { produktionsNummer: 'L1' }, [
        { bestandId: 'b1', menge: 3 },
        { bestandId: null, menge: 2 },
      ]);
      expect(bestand('b1')).toMatchObject({ anzahl: 8, chargen: { [id]: 3 } });
      expect(unbestimmt()).toMatchObject({
        geraetId: 'g1',
        lagerort: { art: 'unbestimmt' },
        anzahl: 2,
        chargen: { [id]: 2 },
      });
      expect(geraet('g1')!.bestandGesamt).toBe(10);
      expect(buchungen().map((b) => [b.art, b.menge, (b as { chargeId?: string }).chargeId]))
        .toEqual([
          ['zugang', 3, id],
          ['zugang', 2, id],
        ]);
    });

    it('nimmt den vorhandenen Lagerort „ohne Lagerort" wieder', async () => {
      putGeraet('g1', { chargen: [chargeA], bestandGesamt: 4 });
      putChargenBestand('bu', { art: 'unbestimmt' }, 4, { cA: 4 });
      const { id } = await saveGeraetCharge('ffnd', 'g1', { produktionsNummer: 'L2' }, [
        { bestandId: null, menge: 1 },
      ]);
      expect(bestand('bu')).toMatchObject({ anzahl: 5, chargen: { cA: 4, [id]: 1 } });
      expect(fake.list(`${G}/geraetBestand`)).toHaveLength(1);
    });

    it('lehnt ungültige Zugänge ab und schreibt nichts', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      putGeraet('g2');
      putChargenBestand('b1', srf, 0);
      putBestand('b2', 'g2', lager, 0);
      const cases: [unknown, number | RegExp][] = [
        [[{ bestandId: 'b1', menge: 0 }], 400],
        [[{ bestandId: 'b1', menge: -1 }], 400],
        [[{ bestandId: 'b2', menge: 1 }], 400],
        [[{ bestandId: 'b1', menge: 1 }, { bestandId: 'b1', menge: 1 }], 400],
        [[{ bestandId: null, menge: 1 }, { bestandId: null, menge: 1 }], 400],
        [[{ bestandId: 'a/b', menge: 1 }], 400],
        [[{ bestandId: 'weg', menge: 1 }], /not found/],
        ['kaputt', 400],
      ];
      for (const [zugaenge, expected] of cases) {
        const call = saveGeraetCharge('ffnd', 'g1', { produktionsNummer: 'x' }, zugaenge as never);
        if (expected instanceof RegExp) await expect(call).rejects.toThrow(expected);
        else await expect(call).rejects.toMatchObject({ status: expected });
      }
      // Beim Ändern einer Charge gibt es keinen Zugang.
      await expect(
        saveGeraetCharge('ffnd', 'g1', { id: 'cA' }, [{ bestandId: 'b1', menge: 1 }]),
      ).rejects.toMatchObject({ status: 400 });
      expect(chargenOf('g1')).toEqual([chargeA]);
      expect(bestand('b1')!.anzahl).toBe(0);
      expect(buchungen()).toHaveLength(0);
    });
  });

  describe('Größengrenzen', () => {
    const long = 'x'.repeat(GERAET_CHARGE_MAX_TEXT + 1);

    it('lehnt zu lange Texte einer Charge ab', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      for (const field of ['bezeichnung', 'produktionsNummer', 'kommentar']) {
        await expect(saveGeraetCharge('ffnd', 'g1', { [field]: long })).rejects.toMatchObject({
          status: 400,
        });
      }
      await saveGeraetCharge('ffnd', 'g1', { kommentar: 'x'.repeat(GERAET_CHARGE_MAX_TEXT) });
      expect(chargenOf('g1')).toHaveLength(2);
    });

    it('lehnt mehr als die Höchstzahl an Chargen ab, auch über einen Zugang', async () => {
      const full = Array.from({ length: GERAET_CHARGEN_MAX }, (_, i) => ({
        ...chargeA,
        id: `c${i}`,
        archiviert: i % 2 === 0,
      }));
      putGeraet('g1', { chargen: full });
      putChargenBestand('b1', srf, 0);
      await expect(saveGeraetCharge('ffnd', 'g1', { produktionsNummer: 'neu' })).rejects.toMatchObject({
        status: 400,
      });
      await expect(
        bookGeraetBestand('ffnd', {
          art: 'zugang',
          bestandId: 'b1',
          menge: 1,
          neueCharge: { produktionsNummer: 'neu' },
        }),
      ).rejects.toMatchObject({ status: 400 });
      // Ändern einer vorhandenen Charge bleibt möglich.
      await saveGeraetCharge('ffnd', 'g1', { id: 'c1', produktionsNummer: 'geändert' });
      expect(chargenOf('g1')).toHaveLength(GERAET_CHARGEN_MAX);
      expect(buchungen()).toHaveLength(0);
    });

    it('lehnt zu lange Texte einer neuen Charge im Zugang ab', async () => {
      putGeraet('g1');
      putChargenBestand('b1', srf, 0);
      await expect(
        bookGeraetBestand('ffnd', {
          art: 'zugang',
          bestandId: 'b1',
          menge: 1,
          neueCharge: { produktionsNummer: long },
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('lehnt eine zu lange Bemerkung beim Ausbuchen ab', async () => {
      putGeraet('g1', { chargen: [chargeA], bestandGesamt: 2 });
      putChargenBestand('b1', srf, 2, { cA: 2 });
      await expect(ausbuchenGeraetCharge('ffnd', 'g1', 'cA', long)).rejects.toMatchObject({
        status: 400,
      });
      expect(bestand('b1')!.anzahl).toBe(2);
      expect(buchungen()).toHaveLength(0);
    });
  });

  describe('archiveGeraetCharge', () => {
    it('lehnt das Archivieren mit Bestand ab und archiviert sonst', async () => {
      putGeraet('g1', { chargen: [chargeA, chargeB] });
      putChargenBestand('b1', srf, 5, { cA: 2 });
      putChargenBestand('b2', lager, 3, { cB: 0 });
      await expect(archiveGeraetCharge('ffnd', 'g1', 'cA')).rejects.toMatchObject({
        status: 409,
      });
      await archiveGeraetCharge('ffnd', 'g1', 'cB');
      expect(chargenOf('g1')).toEqual([chargeA, { ...chargeB, archiviert: true }]);
    });

    it('zählt archivierte Lagerorte nicht', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      putChargenBestand('b1', srf, 2, { cA: 2 });
      fake.put(`${G}/geraetBestand/b1`, { ...bestand('b1')!, archiviert: true });
      await archiveGeraetCharge('ffnd', 'g1', 'cA');
      expect(chargenOf('g1')[0].archiviert).toBe(true);
    });

    it('meldet eine unbekannte Charge mit 404', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      await expect(archiveGeraetCharge('ffnd', 'g1', 'weg')).rejects.toThrow(/not found/);
    });
  });

  describe('ausbuchenGeraetCharge', () => {
    it('bucht die Charge an allen Lagerorten aus und archiviert sie', async () => {
      putGeraet('g1', { chargen: [chargeA, chargeB], bestandGesamt: 12, mindestbestand: 8 });
      putChargenBestand('b1', srf, 10, { cA: 4, cB: 6 });
      putChargenBestand('b2', lager, 2, { cA: 2 });
      await ausbuchenGeraetCharge('ffnd', 'g1', 'cA', ' abgelaufen ');
      expect(bestand('b1')).toMatchObject({ anzahl: 6, chargen: { cB: 6 } });
      expect(bestand('b2')!.anzahl).toBe(0);
      expect(bestand('b2')).not.toHaveProperty('chargen');
      expect(geraet('g1')!.bestandGesamt).toBe(6);
      expect(chargenOf('g1')[0]).toMatchObject({ id: 'cA', archiviert: true });
      expect(
        buchungen().map((b) => [b.art, b.menge, b.bestandId, (b as { chargeId?: string }).chargeId]),
      ).toEqual([
        ['inventur', -4, 'b1', 'cA'],
        ['inventur', -2, 'b2', 'cA'],
      ]);
      expect((buchungen()[0] as { bemerkung?: string }).bemerkung).toBe(
        'Charge ausgebucht: LOT A – abgelaufen',
      );
      expect(notifyMock).toHaveBeenCalledOnce();
    });

    it('entfernt einen negativen Topf nur, ohne Buchung und ohne Mengenänderung', async () => {
      putGeraet('g1', { chargen: [chargeA, chargeB], bestandGesamt: 10 });
      putChargenBestand('b1', srf, 10, { cA: -2, cB: 3 });
      await ausbuchenGeraetCharge('ffnd', 'g1', 'cA');
      expect(bestand('b1')!.anzahl).toBe(10);
      expect(bestand('b1')!.chargen).toEqual({ cB: 3 });
      expect(buchungen()).toHaveLength(0);
      expect(geraet('g1')!.bestandGesamt).toBe(10);
      expect(chargenOf('g1')[0]).toMatchObject({ id: 'cA', archiviert: true });
    });

    it('archiviert eine Charge ohne Bestand ohne Buchung', async () => {
      putGeraet('g1', { chargen: [chargeA] });
      putChargenBestand('b1', srf, 3);
      await ausbuchenGeraetCharge('ffnd', 'g1', 'cA');
      expect(buchungen()).toHaveLength(0);
      expect(chargenOf('g1')[0].archiviert).toBe(true);
    });
  });

  describe('aufteilenGeraetBestand', () => {
    beforeEach(() => {
      putGeraet('g1', { chargen: [chargeA, chargeB, chargeAlt], bestandGesamt: 40 });
      putChargenBestand('b1', srf, 40);
    });

    it('setzt die Aufteilung und bucht sie ohne Mengenänderung', async () => {
      await aufteilenGeraetBestand('ffnd', 'b1', { cA: 25 });
      expect(bestand('b1')).toMatchObject({ anzahl: 40, chargen: { cA: 25 } });
      expect(geraet('g1')!.bestandGesamt).toBe(40);
      expect(buchungen()).toEqual([
        expect.objectContaining({
          art: 'aufteilung',
          menge: 0,
          bestandId: 'b1',
          bemerkung: 'LOT A: 0→25, ohne Charge: 40→15',
        }),
      ]);

      await aufteilenGeraetBestand('ffnd', 'b1', { cA: 0, cB: 10 });
      expect(bestand('b1')!.chargen).toEqual({ cB: 10 });
      await aufteilenGeraetBestand('ffnd', 'b1', {});
      expect(bestand('b1')).not.toHaveProperty('chargen');
    });

    it('lehnt zu große, negative, fremde und archivierte Mengen ab', async () => {
      await expect(aufteilenGeraetBestand('ffnd', 'b1', { cA: 30, cB: 11 })).rejects.toThrow();
      await expect(aufteilenGeraetBestand('ffnd', 'b1', { cA: -1 })).rejects.toThrow();
      await expect(aufteilenGeraetBestand('ffnd', 'b1', { fremd: 1 })).rejects.toThrow();
      await expect(aufteilenGeraetBestand('ffnd', 'b1', { cX: 1 })).rejects.toThrow();
      await expect(
        aufteilenGeraetBestand('ffnd', 'b1', { cA: Number.NaN }),
      ).rejects.toThrow();
      expect(bestand('b1')).not.toHaveProperty('chargen');
      expect(buchungen()).toHaveLength(0);
    });

    it('lehnt ein Gerät ohne Verbrauchsmaterial ab', async () => {
      putGeraet('g1', { chargen: [chargeA], verbrauchsmaterial: false });
      await expect(aufteilenGeraetBestand('ffnd', 'b1', { cA: 1 })).rejects.toThrow();
    });
  });

  describe('bookGeraetBestand', () => {
    beforeEach(() => {
      putGeraet('g1', { chargen: [chargeA, chargeB, chargeAlt], bestandGesamt: 10 });
      putChargenBestand('b1', srf, 10, { cA: 4, cB: 6 });
      putChargenBestand('b2', lager, 0);
    });

    it('bucht einen Zugang mit neuer Charge in einer Transaktion', async () => {
      await bookGeraetBestand('ffnd', {
        art: 'zugang',
        bestandId: 'b2',
        menge: 5,
        neueCharge: { produktionsNummer: ' L1 ', ablaufDatum: '2027-01-01' },
      });
      const neu = chargenOf('g1')[3];
      expect(neu).toMatchObject({ produktionsNummer: 'L1', ablaufDatum: '2027-01-01', createdBy: 'u1' });
      expect(bestand('b2')).toMatchObject({ anzahl: 5, chargen: { [neu.id as string]: 5 } });
      expect(geraet('g1')!.bestandGesamt).toBe(15);
      expect(buchungen()).toEqual([
        expect.objectContaining({ art: 'zugang', menge: 5, chargeId: neu.id }),
      ]);
    });

    it('bucht einen Zugang auf eine vorhandene Charge', async () => {
      await bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 2, chargeId: 'cA' });
      expect(bestand('b1')).toMatchObject({ anzahl: 12, chargen: { cA: 6, cB: 6 } });
      expect(buchungen()).toEqual([expect.objectContaining({ chargeId: 'cA', menge: 2 })]);
    });

    it('lehnt archivierte, unbekannte und Chargen an Geräten ab', async () => {
      await expect(
        bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 2, chargeId: 'cX' }),
      ).rejects.toThrow();
      await expect(
        bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 2, chargeId: 'weg' }),
      ).rejects.toThrow();
      putGeraet('g1', { chargen: [chargeA], verbrauchsmaterial: false });
      await expect(
        bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b1', menge: 2, chargeId: 'cA' }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        bookGeraetBestand('ffnd', {
          art: 'inventur',
          bestandId: 'b1',
          istWert: 0,
          istWertJeCharge: {},
          istWertOhneCharge: 0,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(buchungen()).toHaveLength(0);
    });

    it('bucht eine Umbuchung einer Charge samt Anteil', async () => {
      const { buchungId } = await bookGeraetBestand('ffnd', {
        art: 'umbuchung',
        bestandId: 'b1',
        zielBestandId: 'b2',
        menge: 3,
        chargeId: 'cB',
      });
      expect(bestand('b1')).toMatchObject({ anzahl: 7, chargen: { cA: 4, cB: 3 } });
      expect(bestand('b2')).toMatchObject({ anzahl: 3, chargen: { cB: 3 } });
      expect(buchungen()).toEqual([
        expect.objectContaining({
          id: buchungId,
          art: 'umbuchung',
          menge: -3,
          chargeId: 'cB',
          zielBestandId: 'b2',
        }),
      ]);
      expect(geraet('g1')!.bestandGesamt).toBe(10);
    });

    it('lehnt eine Umbuchung über den Bestand der gewählten Charge ab', async () => {
      await expect(
        bookGeraetBestand('ffnd', {
          art: 'umbuchung',
          bestandId: 'b1',
          zielBestandId: 'b2',
          menge: 5,
          chargeId: 'cA',
        }),
      ).rejects.toMatchObject({ status: 400, message: 'umbuchung exceeds charge stock' });
      // Fehlt die Charge am Quell-Lagerort, zählt sie als 0.
      putChargenBestand('b2', lager, 3);
      await expect(
        bookGeraetBestand('ffnd', {
          art: 'umbuchung',
          bestandId: 'b2',
          zielBestandId: 'b1',
          menge: 1,
          chargeId: 'cA',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(bestand('b1')).toMatchObject({ anzahl: 10, chargen: { cA: 4, cB: 6 } });
      expect(buchungen()).toHaveLength(0);
    });

    it('verteilt eine Umbuchung ohne Charge nach FEFO', async () => {
      const { buchungId } = await bookGeraetBestand('ffnd', {
        art: 'umbuchung',
        bestandId: 'b1',
        zielBestandId: 'b2',
        menge: 5,
      });
      expect(bestand('b1')).toMatchObject({ anzahl: 5, chargen: { cB: 5 } });
      expect(bestand('b2')).toMatchObject({ anzahl: 5, chargen: { cA: 4, cB: 1 } });
      const list = buchungen();
      expect(list.map((b) => [b.menge, (b as { chargeId?: string }).chargeId])).toEqual([
        [-4, 'cA'],
        [-1, 'cB'],
      ]);
      expect(list[0].id).toBe(buchungId);
    });

    it('setzt bei der Inventur je Charge Aufteilung und Ist-Wert', async () => {
      await bookGeraetBestand('ffnd', {
        art: 'inventur',
        bestandId: 'b1',
        istWert: 999,
        istWertJeCharge: { cA: 4, cB: 2 },
        istWertOhneCharge: 1,
      });
      expect(bestand('b1')).toMatchObject({ anzahl: 7, chargen: { cA: 4, cB: 2 } });
      expect(geraet('g1')!.bestandGesamt).toBe(7);
      expect(
        buchungen().map((b) => [b.art, b.menge, (b as { chargeId?: string }).chargeId]),
      ).toEqual([
        ['inventur', -4, 'cB'],
        ['inventur', 1, undefined],
      ]);
    });

    it('lehnt eine Inventur mit archivierter Charge ab', async () => {
      await expect(
        bookGeraetBestand('ffnd', {
          art: 'inventur',
          bestandId: 'b1',
          istWert: 0,
          istWertJeCharge: { cX: 1 },
          istWertOhneCharge: 0,
        }),
      ).rejects.toThrow();
    });

    it('verkleinert bei der Inventur ohne Chargen die Aufteilung', async () => {
      await bookGeraetBestand('ffnd', { art: 'inventur', bestandId: 'b1', istWert: 5 });
      expect(bestand('b1')).toMatchObject({ anzahl: 5, chargen: { cB: 5 } });
      expect(buchungen()).toEqual([expect.objectContaining({ art: 'inventur', menge: -5 })]);
      expect(buchungen()[0]).not.toHaveProperty('chargeId');
    });
  });

  it('deleteGeraetBestand bucht den Restbestand je Topf aus', async () => {
    putGeraet('g1', { chargen: [chargeA], bestandGesamt: 10 });
    putChargenBestand('b1', srf, 10, { cA: 4 });
    await deleteGeraetBestand('ffnd', 'b1');
    expect(geraet('g1')!.bestandGesamt).toBe(0);
    expect(
      buchungen().map((b) => [
        b.menge,
        (b as { chargeId?: string }).chargeId,
        (b as { bemerkung?: string }).bemerkung,
      ]),
    ).toEqual([
      [-4, 'cA', 'Lagerort gelöscht: SRF · GR 2'],
      [-6, undefined, 'Lagerort gelöscht: SRF · GR 2'],
    ]);
  });

  describe('syncGeraetVerbrauch', () => {
    const E = 'call/fc1/geraetEinsatz';
    function putEintrag(id: string, data: Record<string, unknown>) {
      fake.put(`${E}/${id}`, {
        groupId: 'ffnd',
        geraetId: 'g1',
        geraetName: 'Bindevlies Economy',
        art: 'verbraucht',
        bestandId: 'b1',
        menge: 5,
        zeitpunkt: '2026-10-04T10:00:00.000Z',
        createdAt: '2026-10-04T10:00:00.000Z',
        createdBy: 'u2',
        ...data,
      });
    }

    beforeEach(() => {
      putGeraet('g1', { chargen: [chargeA, chargeB], bestandGesamt: 10 });
      putChargenBestand('b1', srf, 10, { cA: 4, cB: 6 });
    });

    it('bucht zwei Teile am selben Lagerort in einem Schreibvorgang', async () => {
      putEintrag('e1', {
        chargen: [
          { chargeId: 'cA', menge: 4 },
          { chargeId: 'cB', menge: 1 },
        ],
      });
      await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 2 });
      expect(bestand('b1')).toMatchObject({ anzahl: 5, chargen: { cB: 5 } });
      expect(geraet('g1')!.bestandGesamt).toBe(5);
      expect(
        buchungen().map((b) => [b.art, b.menge, (b as { chargeId?: string }).chargeId]),
      ).toEqual([
        ['verbrauch', -4, 'cA'],
        ['verbrauch', -1, 'cB'],
      ]);

      // Idempotent.
      await expect(syncGeraetVerbrauch('fc1', 'e1')).resolves.toEqual({ deltas: 0 });

      // Chargenwechsel: alles aus B.
      putEintrag('e1', { chargen: [{ chargeId: 'cB', menge: 5 }] });
      await syncGeraetVerbrauch('fc1', 'e1');
      expect(bestand('b1')).toMatchObject({ anzahl: 5, chargen: { cA: 4, cB: 1 } });
      expect(geraet('g1')!.bestandGesamt).toBe(5);

      // Löschen storniert je Charge.
      fake.docs.delete(`${E}/e1`);
      await syncGeraetVerbrauch('fc1', 'e1');
      expect(bestand('b1')).toMatchObject({ anzahl: 10, chargen: { cA: 4, cB: 6 } });
    });

    it('bucht eine unstimmige Aufteilung auf den Rest ohne Charge', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      putEintrag('e1', { menge: 3, chargen: [{ chargeId: 'cA', menge: 1 }] });
      await syncGeraetVerbrauch('fc1', 'e1');
      expect(bestand('b1')).toMatchObject({ anzahl: 7, chargen: { cA: 4, cB: 6 } });
      expect(buchungen()).toHaveLength(1);
      expect(buchungen()[0]).not.toHaveProperty('chargeId');
      expect(warn).toHaveBeenCalled();
    });

    it('nimmt eine archivierte Charge des Artikels an', async () => {
      putGeraet('g1', { chargen: [chargeA, { ...chargeB, archiviert: true }], bestandGesamt: 10 });
      putEintrag('e1', { menge: 2, chargen: [{ chargeId: 'cB', menge: 2 }] });
      await syncGeraetVerbrauch('fc1', 'e1');
      expect(bestand('b1')).toMatchObject({ anzahl: 8, chargen: { cA: 4, cB: 4 } });
    });
  });

  it('importGeraete verkleinert die Aufteilung, wenn die Anzahl sinkt', async () => {
    putGeraet('100', {
      externeId: '100',
      bezeichnung: 'Artikel 100',
      chargen: [chargeA, chargeB],
      bestandGesamt: 8,
      importedAt: '2026-09-01T00:00:00.000Z',
    });
    fake.put(`${G}/geraetBestand/b1`, {
      geraetId: '100',
      lagerort: srf,
      lagerortKey: lagerortKey(srf),
      anzahl: 8,
      chargen: { cA: 3, cB: 5 },
    });
    await importGeraete('ffnd', file([{ id: '100', lagerort: srf, anzahl: 4 }]), []);
    expect(bestand('b1')).toMatchObject({ anzahl: 4, chargen: { cB: 4 } });
    expect(geraet('100')!.chargen).toEqual([chargeA, chargeB]);
  });

  it('importGeraete verkleinert die Aufteilung auch bei zugestimmter Abweichung', async () => {
    putGeraet('100', {
      externeId: '100',
      bezeichnung: 'Artikel 100',
      chargen: [chargeA],
      bestandGesamt: 3,
      importedAt: '2026-09-01T00:00:00.000Z',
    });
    fake.put(`${G}/geraetBestand/b1`, {
      geraetId: '100',
      lagerort: srf,
      lagerortKey: lagerortKey(srf),
      anzahl: 3,
      chargen: { cA: 3 },
    });
    fake.put(`${G}/geraetBuchung/k1`, {
      geraetId: '100',
      bestandId: 'b1',
      art: 'verbrauch',
      menge: -1,
      createdAt: '2026-09-15T00:00:00.000Z',
    });
    await importGeraete('ffnd', file([{ id: '100', lagerort: srf, anzahl: 1 }]), [
      deviationKey({ geraetId: '100', lagerortKey: lagerortKey(srf) }),
    ]);
    expect(bestand('b1')).toMatchObject({ anzahl: 1, chargen: { cA: 1 } });
  });
});

// --- Historie ----------------------------------------------------------------

describe('Historie: Protokolleinträge je Action', () => {
  const lotA = {
    id: 'cA',
    produktionsNummer: 'A',
    ablaufDatum: '2026-12-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'u0',
  };

  describe('saveGeraet', () => {
    it('protokolliert das Anlegen mit den gesetzten Feldern', async () => {
      const { id } = await saveGeraet('ffnd', {
        bezeichnung: 'Bindevlies',
        verbrauchsmaterial: true,
        mindestbestand: 5,
      });
      expect(protokoll(id)).toEqual([
        expect.objectContaining({
          art: 'angelegt',
          menge: 0,
          geraetId: id,
          createdBy: 'u1',
          createdByName: 'Max Mustermann',
        }),
      ]);
      const [entry] = protokoll(id);
      expect(entry).not.toHaveProperty('bestandId');
      expect(entry.aenderungen).toEqual(
        expect.arrayContaining([
          { feld: 'bezeichnung', nachher: 'Bindevlies' },
          { feld: 'verbrauchsmaterial', nachher: 'ja' },
          { feld: 'mindestbestand', nachher: '5' },
          { feld: 'active', nachher: 'ja' },
        ]),
      );
    });

    it('protokolliert geänderte Stammdaten als Diff', async () => {
      putGeraet('g1', { mindestbestand: 2, bemerkung: 'alt', einheit: 'Sack' });
      await saveGeraet('ffnd', { id: 'g1', mindestbestand: 5, bemerkung: '', einheit: 'Sack' });
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'stammdaten',
          menge: 0,
          aenderungen: [
            { feld: 'bemerkung', vorher: 'alt' },
            { feld: 'mindestbestand', vorher: '2', nachher: '5' },
          ],
        }),
      ]);
    });

    it('schreibt ohne Änderung keinen Eintrag', async () => {
      putGeraet('g1', { einheit: 'Sack' });
      await saveGeraet('ffnd', { id: 'g1', einheit: ' Sack ', bezeichnung: 'Bindevlies Economy' });
      expect(protokoll()).toHaveLength(0);
    });
  });

  describe('setGeraeteVerbrauchsmaterial', () => {
    it('protokolliert nur Artikel, deren Flag sich ändert', async () => {
      putGeraet('g1', { verbrauchsmaterial: false });
      putGeraet('g2', { verbrauchsmaterial: true });
      await setGeraeteVerbrauchsmaterial('ffnd', ['g1', 'g2'], true);
      expect(protokoll()).toEqual([
        expect.objectContaining({
          art: 'stammdaten',
          geraetId: 'g1',
          aenderungen: [{ feld: 'verbrauchsmaterial', vorher: 'nein', nachher: 'ja' }],
        }),
      ]);
    });

    it('nennt beim Abschalten auch den weggefallenen Mindestbestand', async () => {
      putGeraet('g1', { mindestbestand: 4 });
      await setGeraeteVerbrauchsmaterial('ffnd', ['g1'], false);
      expect(protokoll('g1')[0].aenderungen).toEqual([
        { feld: 'verbrauchsmaterial', vorher: 'ja', nachher: 'nein' },
        { feld: 'mindestbestand', vorher: '4' },
      ]);
    });
  });

  describe('deleteGeraet', () => {
    it('protokolliert das Deaktivieren', async () => {
      putGeraet('g1', { bestandGesamt: 2 });
      putBestand('b1', 'g1', srf, 2);
      fake.put(`${G}/geraetBuchung/k1`, { geraetId: 'g1', bestandId: 'b1', art: 'zugang', menge: 2 });
      await deleteGeraet('ffnd', 'g1');
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'archiviert',
          menge: 0,
          aenderungen: [{ feld: 'active', vorher: 'ja', nachher: 'nein' }],
        }),
      ]);
    });

    it('lässt beim Löschen keinen Eintrag zurück', async () => {
      putGeraet('g1');
      await deleteGeraet('ffnd', 'g1');
      expect(alleBuchungen()).toHaveLength(0);
    });
  });

  describe('Chargen', () => {
    it('protokolliert das Anlegen samt Zugang mit Lagerort-Text', async () => {
      putGeraet('g1', { bestandGesamt: 1 });
      putBestand('b1', 'g1', srf, 1);
      const { id } = await saveGeraetCharge(
        'ffnd',
        'g1',
        { produktionsNummer: 'L1', ablaufDatum: '2027-01-31' },
        [
          { bestandId: 'b1', menge: 3 },
          { bestandId: null, menge: 2 },
        ],
      );
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'charge',
          menge: 0,
          chargeId: id,
          bemerkung: 'angelegt',
          aenderungen: [
            { feld: 'produktionsNummer', nachher: 'L1' },
            { feld: 'ablaufDatum', nachher: '2027-01-31' },
          ],
        }),
      ]);
      expect(buchungen().map((b) => [b.art, b.menge, b.lagerortText])).toEqual([
        ['zugang', 3, 'SRF · GR 2'],
        ['zugang', 2, 'ohne Lagerort'],
      ]);
    });

    it('protokolliert das Ändern als Diff und ohne Änderung nichts', async () => {
      putGeraet('g1', { chargen: [lotA] });
      await saveGeraetCharge('ffnd', 'g1', { id: 'cA', produktionsNummer: 'A', ablaufDatum: '2026-12-01' });
      expect(protokoll()).toHaveLength(0);
      await saveGeraetCharge('ffnd', 'g1', {
        id: 'cA',
        produktionsNummer: 'A2',
        ablaufDatum: '2026-12-01',
      });
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'charge',
          chargeId: 'cA',
          bemerkung: 'geändert',
          aenderungen: [{ feld: 'produktionsNummer', vorher: 'A', nachher: 'A2' }],
        }),
      ]);
    });

    it('protokolliert das Archivieren', async () => {
      putGeraet('g1', { chargen: [lotA] });
      await archiveGeraetCharge('ffnd', 'g1', 'cA');
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({ art: 'charge', chargeId: 'cA', bemerkung: 'archiviert', menge: 0 }),
      ]);
    });

    it('protokolliert das Ausbuchen als Archivieren, die Inventur mit Lagerort-Text', async () => {
      putGeraet('g1', { chargen: [lotA], bestandGesamt: 4 });
      putBestand('b1', 'g1', srf, 4);
      fake.put(`${G}/geraetBestand/b1`, { ...bestand('b1')!, chargen: { cA: 4 } });
      await ausbuchenGeraetCharge('ffnd', 'g1', 'cA');
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({ art: 'charge', chargeId: 'cA', bemerkung: 'archiviert' }),
      ]);
      expect(buchungen()).toEqual([
        expect.objectContaining({ art: 'inventur', menge: -4, lagerortText: 'SRF · GR 2' }),
      ]);
    });
  });

  describe('Lagerorte', () => {
    it('protokolliert das Anlegen ohne Menge', async () => {
      putGeraet('g1');
      const { id } = await createGeraetBestand('ffnd', 'g1', { ...srf, bemerkung: 'oben' });
      expect(buchungen()).toHaveLength(0);
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'lagerort',
          menge: 0,
          bestandId: id,
          bemerkung: 'angelegt',
          lagerortText: 'SRF · GR 2',
          aenderungen: [
            { feld: 'lagerort', nachher: 'SRF · GR 2' },
            { feld: 'bemerkung', nachher: 'oben' },
          ],
        }),
      ]);
    });

    it('protokolliert das Anlegen mit Menge zusätzlich zur Inventur', async () => {
      putGeraet('g1');
      await createGeraetBestand('ffnd', 'g1', srf, 4);
      expect(buchungen()).toEqual([
        expect.objectContaining({ art: 'inventur', menge: 4, lagerortText: 'SRF · GR 2' }),
      ]);
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({ art: 'lagerort', bemerkung: 'angelegt' }),
      ]);
    });

    it('protokolliert das Ändern als Diff und ohne Änderung nichts', async () => {
      putGeraet('g1', { bestandGesamt: 3 });
      putBestand('b1', 'g1', srf, 3);
      await updateGeraetBestand('ffnd', 'b1', { ...srf });
      expect(protokoll()).toHaveLength(0);
      await updateGeraetBestand('ffnd', 'b1', { ...lager, bemerkung: 'Regal 3' });
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'lagerort',
          menge: 0,
          bestandId: 'b1',
          bemerkung: 'geändert',
          lagerortText: 'Feuerwehrhaus · Lager',
          aenderungen: [
            { feld: 'lagerort', vorher: 'SRF · GR 2', nachher: 'Feuerwehrhaus · Lager' },
            { feld: 'bemerkung', nachher: 'Regal 3' },
          ],
        }),
      ]);
    });

    it('protokolliert das Löschen samt Ausbuchung mit Lagerort-Text', async () => {
      putGeraet('g1', { bestandGesamt: 2 });
      putBestand('b1', 'g1', srf, 2);
      await deleteGeraetBestand('ffnd', 'b1');
      expect(buchungen()).toEqual([
        expect.objectContaining({ art: 'inventur', menge: -2, lagerortText: 'SRF · GR 2' }),
      ]);
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({
          art: 'lagerort',
          bestandId: 'b1',
          bemerkung: 'gelöscht',
          lagerortText: 'SRF · GR 2',
          aenderungen: [{ feld: 'lagerort', vorher: 'SRF · GR 2' }],
        }),
      ]);
    });

    it('protokolliert auch das Archivieren eines im Einsatz genutzten Lagerorts', async () => {
      putGeraet('g1');
      putBestand('b1', 'g1', srf, 0);
      fake.put(`${G}/geraetBuchung/v1`, {
        geraetId: 'g1',
        bestandId: 'b1',
        art: 'verbrauch',
        menge: -1,
        firecallId: 'fc1',
      });
      await deleteGeraetBestand('ffnd', 'b1');
      expect(protokoll('g1')).toEqual([
        expect.objectContaining({ art: 'lagerort', bemerkung: 'gelöscht' }),
      ]);
    });
  });

  describe('Bestandsbuchungen', () => {
    it('schreibt den Lagerort-Text an Zugang und Umbuchung', async () => {
      putGeraet('g1', { bestandGesamt: 4 });
      putBestand('b1', 'g1', srf, 1);
      putBestand('b2', 'g1', lager, 3);
      await bookGeraetBestand('ffnd', { art: 'zugang', bestandId: 'b2', menge: 1 });
      await bookGeraetBestand('ffnd', {
        art: 'umbuchung',
        bestandId: 'b1',
        zielBestandId: 'b2',
        menge: 1,
      });
      expect(buchungen().map((b) => [b.art, b.lagerortText])).toEqual([
        ['zugang', 'Feuerwehrhaus · Lager'],
        ['umbuchung', 'SRF · GR 2'],
      ]);
      expect(protokoll()).toHaveLength(0);
    });

    it('schreibt den Lagerort-Text an die Aufteilung', async () => {
      putGeraet('g1', { chargen: [lotA], bestandGesamt: 3 });
      putBestand('b1', 'g1', srf, 3);
      await aufteilenGeraetBestand('ffnd', 'b1', { cA: 2 });
      expect(buchungen()).toEqual([
        expect.objectContaining({ art: 'aufteilung', lagerortText: 'SRF · GR 2' }),
      ]);
    });
  });

  describe('syncGeraetVerbrauch', () => {
    beforeEach(() => {
      putGeraet('g1', { bestandGesamt: 4 });
      putBestand('b1', 'g1', srf, 4);
      fake.put('call/fc1/geraetEinsatz/e1', {
        groupId: 'ffnd',
        geraetId: 'g1',
        geraetName: 'Bindevlies Economy',
        art: 'verbraucht',
        bestandId: 'b1',
        menge: 1,
      });
    });

    it('schreibt Name und Art des Einsatzes samt Lagerort-Text', async () => {
      await syncGeraetVerbrauch('fc1', 'e1');
      expect(buchungen()).toEqual([
        expect.objectContaining({
          art: 'verbrauch',
          firecallId: 'fc1',
          firecallName: 'Ölspur B50',
          firecallArt: 'einsatz',
          lagerortText: 'SRF · GR 2',
        }),
      ]);
    });

    it('übernimmt die Art einer Übung', async () => {
      firecallGuard.mockResolvedValue({ id: 'fc1', name: 'Herbstübung', group: 'ffnd', art: 'uebung' });
      await syncGeraetVerbrauch('fc1', 'e1');
      expect(buchungen()[0]).toMatchObject({ firecallName: 'Herbstübung', firecallArt: 'uebung' });
    });
  });

  describe('Sets', () => {
    beforeEach(putSetArtikel);

    const setEntries = () =>
      protokoll()
        .filter((b) => b.art === 'set')
        .map((b) => [b.geraetId, b.bemerkung])
        .sort();

    it('protokolliert beim Anlegen jeden Artikel und den Set-Artikel', async () => {
      await saveGeraetSet('ffnd', { ...validSet, sybosSetArtikelId: 'kiste' });
      expect(setEntries()).toEqual([
        ['besen', 'Set „Ölspur": hinzugefügt'],
        ['binder', 'Set „Ölspur": hinzugefügt'],
        ['kiste', 'Set „Ölspur": verknüpft'],
      ]);
      expect(protokoll().every((b) => b.menge === 0)).toBe(true);
    });

    it('protokolliert beim Ändern nur hinzugekommene und entfernte Artikel', async () => {
      putSet('s1', { inhalt: [{ geraetId: 'besen' }, { geraetId: 'pumpe' }] });
      await saveGeraetSet('ffnd', { ...validSet, id: 's1' });
      expect(setEntries()).toEqual([
        ['binder', 'Set „Ölspur": hinzugefügt'],
        ['pumpe', 'Set „Ölspur": entfernt'],
      ]);
    });

    it('protokolliert ohne geänderten Inhalt nichts', async () => {
      putSet('s1', { inhalt: validSet.inhalt });
      await saveGeraetSet('ffnd', { ...validSet, id: 's1', active: false });
      expect(protokoll()).toHaveLength(0);
    });

    it('protokolliert am gebundenen Set-Artikel die Änderung des Inhalts', async () => {
      putSet('s1', { inhalt: [{ geraetId: 'besen' }], sybosSetArtikelId: 'kiste' });
      await saveGeraetSet('ffnd', { ...validSet, id: 's1', sybosSetArtikelId: 'kiste' });
      expect(setEntries()).toEqual([
        ['binder', 'Set „Ölspur": hinzugefügt'],
        ['kiste', 'Set „Ölspur": Inhalt geändert'],
      ]);
    });

    it('protokolliert beim Löschen jeden Artikel und den Set-Artikel', async () => {
      putSet('s1', { inhalt: [{ geraetId: 'besen' }, { geraetId: 'binder' }], sybosSetArtikelId: 'kiste' });
      await deleteGeraetSet('ffnd', 's1');
      expect(setEntries()).toEqual([
        ['besen', 'Set „Ölspur": gelöscht'],
        ['binder', 'Set „Ölspur": gelöscht'],
        ['kiste', 'Set „Ölspur": gelöscht'],
      ]);
    });
  });

  describe('importGeraete', () => {
    it('protokolliert neue Artikel als angelegt', async () => {
      await importGeraete(
        'ffnd',
        file([{ id: '100', bezeichnung: 'Bindevlies', lagerort: srf, anzahl: 3 }]),
        [],
      );
      expect(protokoll('100')).toEqual([
        expect.objectContaining({ art: 'angelegt', menge: 0, geraetId: '100' }),
      ]);
      expect(protokoll('100')[0].aenderungen).toEqual(
        expect.arrayContaining([{ feld: 'bezeichnung', nachher: 'Bindevlies' }]),
      );
      expect(buchungen()).toEqual([
        expect.objectContaining({ art: 'import', menge: 3, lagerortText: 'SRF · GR 2' }),
      ]);
    });

    it('protokolliert geänderte Stammdaten, unveränderte Artikel nicht', async () => {
      putGeraet('100', {
        externeId: '100',
        bezeichnung: 'Alt',
        bemerkung: 'weg damit',
        mindestbestand: 5,
        importedAt: '2026-09-01T00:00:00.000Z',
      });
      putGeraet('200', {
        externeId: '200',
        bezeichnung: 'Artikel 200',
        materialTyp: 'Massenartikel',
        kategorie: 'Gerät',
        importedAt: '2026-09-01T00:00:00.000Z',
      });
      await importGeraete('ffnd', file([{ id: '100', bezeichnung: 'Neu' }, { id: '200' }]), []);
      expect(protokoll('200')).toHaveLength(0);
      expect(protokoll('100')).toEqual([expect.objectContaining({ art: 'stammdaten', menge: 0 })]);
      const aenderungen = protokoll('100')[0].aenderungen!;
      expect(aenderungen).toEqual(
        expect.arrayContaining([
          { feld: 'bezeichnung', vorher: 'Alt', nachher: 'Neu' },
          { feld: 'bemerkung', vorher: 'weg damit' },
        ]),
      );
      // Händisch gepflegte Felder setzt der Import nicht — kein Eintrag dazu.
      expect(aenderungen.some((a) => a.feld === 'mindestbestand')).toBe(false);
    });
  });
});

describe('syncGeraetZuordnung', () => {
  const E = 'call/fc1/geraetEinsatz';

  function putZuordnung(id: string, data: Record<string, unknown> = {}) {
    fake.put(`${E}/${id}`, {
      groupId: 'ffnd',
      geraetId: 'pumpe',
      geraetName: 'Tauchpumpe',
      art: 'zugeordnet',
      zeitpunkt: '2026-10-04T10:00:00.000Z',
      createdAt: '2026-10-04T10:00:00.000Z',
      createdBy: 'u2',
      ...data,
    });
  }

  const zuordnungen = () =>
    alleBuchungen()
      .filter((b) => b.art === 'zuordnung' || b.art === 'zuordnungEnde')
      .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  beforeEach(() => {
    putGeraet('pumpe', { bezeichnung: 'Tauchpumpe', verbrauchsmaterial: false });
  });

  it('prüft die Einsatzberechtigung mit Schreibrecht und Gruppenmitgliedschaft', async () => {
    firecallGuard.mockRejectedValue(new Error('not authorized'));
    putZuordnung('e1');
    await expect(syncGeraetZuordnung('fc1', 'e1')).rejects.toThrow('not authorized');
    expect(firecallGuard).toHaveBeenCalledWith('fc1', {
      requireWrite: true,
      requireGroupMember: true,
    });
    expect(alleBuchungen()).toHaveLength(0);
  });

  it('protokolliert die Zuordnung mit Name und Art des Einsatzes', async () => {
    firecallGuard.mockResolvedValue({
      id: 'fc1',
      name: 'Herbstübung',
      group: 'ffnd',
      art: 'uebung',
    });
    putZuordnung('e1', { bemerkung: '  am Keller  ' });
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: 'zuordnung' });
    expect(zuordnungen()).toEqual([
      expect.objectContaining({
        geraetId: 'pumpe',
        art: 'zuordnung',
        menge: 0,
        firecallId: 'fc1',
        firecallName: 'Herbstübung',
        firecallArt: 'uebung',
        einsatzEintragId: 'e1',
        bemerkung: 'am Keller',
        createdBy: 'u1',
        createdByName: 'Max Mustermann',
      }),
    ]);
    expect(zuordnungen()[0].bestandId).toBeUndefined();
  });

  it('nimmt ohne Art am Einsatz „einsatz" an', async () => {
    putZuordnung('e1');
    await syncGeraetZuordnung('fc1', 'e1');
    expect(zuordnungen()[0]).toMatchObject({ firecallName: 'Ölspur B50', firecallArt: 'einsatz' });
  });

  it('schreibt beim zweiten Aufruf nichts (idempotent)', async () => {
    putZuordnung('e1');
    await syncGeraetZuordnung('fc1', 'e1');
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: null });
    expect(zuordnungen()).toHaveLength(1);
  });

  it('protokolliert nach dem Löschen das Ende mit dem Artikel der früheren Zuordnung', async () => {
    putZuordnung('e1');
    await syncGeraetZuordnung('fc1', 'e1');
    fake.docs.delete(`${E}/e1`);
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({
      written: 'zuordnungEnde',
    });
    expect(zuordnungen().map((b) => [b.art, b.geraetId])).toEqual([
      ['zuordnung', 'pumpe'],
      ['zuordnungEnde', 'pumpe'],
    ]);
    expect(zuordnungen()[1]).toMatchObject({
      menge: 0,
      firecallId: 'fc1',
      firecallName: 'Ölspur B50',
      firecallArt: 'einsatz',
      einsatzEintragId: 'e1',
    });
    // Ein weiterer Aufruf ändert nichts mehr.
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: null });
    expect(zuordnungen()).toHaveLength(2);
  });

  it('nimmt die zeitlich letzte Protokollart, nicht die zuletzt gelesene', async () => {
    putZuordnung('e1');
    fake.put(`${G}/geraetBuchung/a`, {
      geraetId: 'pumpe',
      art: 'zuordnungEnde',
      menge: 0,
      firecallId: 'fc1',
      einsatzEintragId: 'e1',
      createdAt: '2026-10-04T12:00:00.000Z',
      createdBy: 'u1',
    });
    fake.put(`${G}/geraetBuchung/b`, {
      geraetId: 'pumpe',
      art: 'zuordnung',
      menge: 0,
      firecallId: 'fc1',
      einsatzEintragId: 'e1',
      createdAt: '2026-10-04T11:00:00.000Z',
      createdBy: 'u1',
    });
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: 'zuordnung' });
  });

  it('ein gelöschter Eintrag ohne frühere Zuordnung schreibt nichts', async () => {
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: null });
    expect(alleBuchungen()).toHaveLength(0);
  });

  it('ein Verbrauch schreibt keine Zuordnung', async () => {
    putZuordnung('e1', { art: 'verbraucht', bestandId: 'b1', menge: 1 });
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: null });
    expect(alleBuchungen()).toHaveLength(0);
  });

  it('übergeht Verbrauchsbuchungen mit derselben einsatzEintragId', async () => {
    fake.put(`${G}/geraetBuchung/v1`, {
      geraetId: 'pumpe',
      bestandId: 'b1',
      art: 'verbrauch',
      menge: -1,
      firecallId: 'fc1',
      einsatzEintragId: 'e1',
      createdAt: '2026-10-04T11:00:00.000Z',
      createdBy: 'u1',
    });
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: null });
  });

  it('lehnt einen Eintrag einer fremden Gruppe ab', async () => {
    putZuordnung('e1', { groupId: 'andere' });
    await expect(syncGeraetZuordnung('fc1', 'e1')).rejects.toThrow(/not to the firecall group/);
    expect(alleBuchungen()).toHaveLength(0);
  });

  it('schreibt für einen unbekannten Artikel nichts', async () => {
    putZuordnung('e1', { geraetId: 'weg' });
    await expect(syncGeraetZuordnung('fc1', 'e1')).resolves.toEqual({ written: null });
    expect(alleBuchungen()).toHaveLength(0);
  });

  it('weist unsichere IDs ab', async () => {
    await expect(syncGeraetZuordnung('fc1', 'a/b')).rejects.toThrow(/invalid einsatzEintragId/);
  });
});
