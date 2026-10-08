import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Ein kleines Firestore im Speicher, kopiert aus geraeteActions.test.ts und
 * um `limit()` ergänzt: Dokumente, Abfragen, Transaktionen (erst lesen, dann
 * schreiben), Batches und die Sentinels `increment` und `delete`.
 */
const fake = vi.hoisted(() => {
  type Data = Record<string, unknown>;
  const docs = new Map<string, Data>();
  const batchSizes: number[] = [];
  let autoId = 0;
  /** n-ter Batch-Commit (1-basiert) schreibt und wirft danach — Antwort verloren. */
  let failBatchAt = 0;
  let batchCommits = 0;

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
    limit: (n: number) => FakeQuery;
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

  function query(colPath: string, filters: Filter[], max?: number): FakeQuery {
    return {
      __query: true,
      where(field: string, op: string, value: unknown) {
        return query(colPath, [...filters, { field, op, value }], max);
      },
      limit(n: number) {
        return query(colPath, filters, n);
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
          )
          .slice(0, max ?? Number.MAX_SAFE_INTEGER);
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
          batchCommits += 1;
          if (batchCommits === failBatchAt) throw new Error('DEADLINE_EXCEEDED batch');
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
      failBatchAt = 0;
      batchCommits = 0;
    },
    failBatchCommit(n: number) {
      failBatchAt = n;
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

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));

vi.mock('../../server/firebase/admin', () => ({ firestore: fake.firestore }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: fake.FieldValue }));
vi.mock('../firebase/firestore', () => ({ GROUP_COLLECTION_ID: 'groups' }));
vi.mock('./bekleidungGuard', () => ({ actionBekleidungswartRequired: guard }));
// Die Tests schicken je Blatt ein Raster als JSON statt einer echten XLSX-Datei.
vi.mock('../../common/xlsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/xlsx')>()),
  readXlsxSheetByName: (data: Uint8Array, name: string) => {
    const sheets = JSON.parse(Buffer.from(data).toString('utf-8')) as Record<
      string,
      string[][]
    >;
    if (!sheets[name]) throw new Error(`xlsx: Blatt "${name}" nicht gefunden`);
    return sheets[name];
  },
}));

import { ApiException } from '../../app/api/errors';
import { bestandDocId } from '../../common/bekleidung';
import {
  BEKLEIDUNG_IMPORT_MAX_BYTES,
  SHEET_DIENST,
  SHEET_EINSATZ,
} from '../../common/bekleidungImport';
import {
  adjustBestand,
  createPersonForBekleidung,
  createStuecke,
  importBekleidung,
  issue,
  previewBekleidungImport,
  recordWaesche,
  returnItems,
  saveArtikel,
  setStueckStatus,
  updateStueck,
  type BekleidungActionError,
} from './bekleidungActions';

const G = 'groups/ffnd';
const session = { user: { id: 'u1', name: 'Max Mustermann', groups: ['ffnd'] } };
const STAMPS = {
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'u0',
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'u0',
};

type Doc = Record<string, unknown>;

const get = (path: string) => fake.get(`${G}/${path}`) as Doc | undefined;
const list = (col: string) => fake.list(`${G}/${col}`) as Doc[];

function seed() {
  fake.put(`${G}/person/p1`, { name: 'Max Mustermann', active: true });
  fake.put(`${G}/person/p2`, { name: 'Erika Musterfrau', active: false });
  fake.put(`${G}/bekleidungArtikel/jacke`, {
    kategorie: 'einsatz',
    bezeichnung: 'Branddienst Jacke',
    fuehrung: 'einzeln',
    aktiv: true,
    maxWaschgaenge: 25,
    ...STAMPS,
  });
  fake.put(`${G}/bekleidungArtikel/polo`, {
    kategorie: 'dienst',
    bezeichnung: 'Polo',
    fuehrung: 'menge',
    aktiv: true,
    ...STAMPS,
  });
  const piece = {
    artikelId: 'jacke',
    groesse: 'M3',
    eigentum: 'feuerwehr',
    waschgaenge: 0,
    waschgaengeAltbestand: 0,
    ...STAMPS,
  };
  fake.put(`${G}/bekleidungStueck/s1`, { ...piece, status: 'lager', tagNummer: '1001' });
  fake.put(`${G}/bekleidungStueck/s2`, {
    ...piece,
    status: 'ausgegeben',
    tagNummer: '1002',
    personId: 'p1',
    ausgabeId: 'au1',
    ausgegebenAm: '2025-03-01',
    waschgaenge: 3,
    letzteWaescheAm: '2026-12-01',
  });
  // Aus dem Import: ausgegeben ohne benannte Ausgabe
  fake.put(`${G}/bekleidungStueck/s3`, { ...piece, status: 'ausgegeben' });
  fake.put(`${G}/bekleidungAusgabe/au1`, {
    personId: 'p1',
    stueckId: 's2',
    artikelId: 'jacke',
    groesse: 'M3',
    menge: 1,
    ausgegebenAm: '2025-03-01',
    quelle: 'app',
    ...STAMPS,
  });
  fake.put(`${G}/bekleidungAusgabe/au2`, {
    personId: 'p1',
    artikelId: 'polo',
    groesse: 'M',
    menge: 3,
    ausgegebenAm: '2025-03-01',
    bemerkung: 'Sommer',
    quelle: 'app',
    ...STAMPS,
  });
  fake.put(`${G}/bekleidungBestand/${bestandDocId('polo', 'M')}`, {
    artikelId: 'polo',
    groesse: 'M',
    anzahl: 5,
    updatedAt: STAMPS.updatedAt,
    updatedBy: 'u0',
  });
}

/** Erwarteter Fehler: kommt als `{ success: false, error }` zurück, nicht als Ausnahme. */
async function failsWith(promise: Promise<unknown>, message?: string) {
  await expect(promise).resolves.toMatchObject({
    success: false,
    ...(message ? { error: message } : {}),
  });
}

/** Erfolgreiches Ergebnis auspacken; ein Fehlerergebnis lässt den Test scheitern. */
function ok<T>(result: T | BekleidungActionError): T {
  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    throw new Error(`action failed: ${(result as BekleidungActionError).error}`);
  }
  return result as T;
}

beforeEach(() => {
  fake.reset();
  guard.mockReset();
  guard.mockResolvedValue(session);
  seed();
});

describe('Guard', () => {
  it('ruft den Guard zuerst mit der Gruppe auf und bricht bei Ablehnung ab', async () => {
    guard.mockRejectedValueOnce(new ApiException('forbidden', { status: 403 }));
    const before = fake.docs.size;
    await failsWith(
      issue('ffnd', { personId: 'p1', datum: '2026-10-08', stueckIds: ['s1'], mengen: [] })
    );
    expect(guard).toHaveBeenCalledWith('ffnd');
    expect(fake.docs.size).toBe(before);
    expect(get('bekleidungStueck/s1')?.status).toBe('lager');
  });

  it('wirft unerwartete Fehler weiter statt sie als Ergebnis zu melden', async () => {
    guard.mockRejectedValueOnce(new Error('boom'));
    await expect(
      issue('ffnd', { personId: 'p1', datum: '2026-10-08', stueckIds: ['s1'], mengen: [] }),
    ).rejects.toThrow('boom');
  });

  it('jede Action ruft den Guard mit der Gruppe', async () => {
    guard.mockRejectedValue(new ApiException('forbidden', { status: 403 }));
    const calls: Promise<unknown>[] = [
      saveArtikel('ffnd', undefined, {
        kategorie: 'dienst',
        bezeichnung: 'Hemd',
        fuehrung: 'menge',
        aktiv: true,
      }),
      createStuecke('ffnd', { artikelId: 'jacke', groesse: 'M', eigentum: 'feuerwehr', anzahl: 1 }),
      updateStueck('ffnd', 's1', { groesse: 'M', eigentum: 'feuerwehr' }),
      returnItems('ffnd', { datum: '2026-10-08', ziel: 'lager', stueckIds: ['s2'], mengen: [] }),
      setStueckStatus('ffnd', 's1', 'ausgeschieden', '2026-10-08'),
      adjustBestand('ffnd', { artikelId: 'polo', groesse: 'M', delta: 1 }),
      recordWaesche('ffnd', { datum: '2026-10-08', programm: 'standard', stueckIds: ['s1'] }),
      createPersonForBekleidung('ffnd', 'Hans Beispiel'),
      previewBekleidungImport('ffnd', ''),
      importBekleidung('ffnd', '', { fuehrung: {}, persons: {} }),
    ];
    for (const call of calls) await failsWith(call);
    expect(guard).toHaveBeenCalledTimes(calls.length);
    expect(guard.mock.calls.every(([g]) => g === 'ffnd')).toBe(true);
  });
});

describe('issue', () => {
  it('bucht Stück und Menge in einem Zug', async () => {
    const { ausgabeIds } = ok(await issue('ffnd', {
      personId: 'p1',
      datum: '2026-10-08',
      bemerkung: 'Neuaufnahme',
      stueckIds: ['s1'],
      mengen: [{ artikelId: 'polo', groesse: ' m ', menge: 2 }],
    }));
    expect(ausgabeIds).toHaveLength(2);

    const stueck = get('bekleidungStueck/s1')!;
    expect(stueck).toMatchObject({
      status: 'ausgegeben',
      personId: 'p1',
      ausgegebenAm: '2026-10-08',
      updatedBy: 'u1',
    });
    expect(ausgabeIds).toContain(stueck.ausgabeId);

    const pieceAusgabe = get(`bekleidungAusgabe/${stueck.ausgabeId as string}`)!;
    expect(pieceAusgabe).toMatchObject({
      personId: 'p1',
      stueckId: 's1',
      artikelId: 'jacke',
      groesse: 'M3',
      menge: 1,
      ausgegebenAm: '2026-10-08',
      bemerkung: 'Neuaufnahme',
      quelle: 'app',
      createdBy: 'u1',
    });
    expect(pieceAusgabe.zurueckAm).toBeUndefined();

    const mengeId = ausgabeIds.find((id) => id !== stueck.ausgabeId)!;
    expect(get(`bekleidungAusgabe/${mengeId}`)).toMatchObject({
      personId: 'p1',
      artikelId: 'polo',
      groesse: 'M',
      menge: 2,
    });
    expect(get(`bekleidungAusgabe/${mengeId}`)?.stueckId).toBeUndefined();
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'M')}`)?.anzahl).toBe(3);
  });

  it('lehnt ein schon ausgegebenes Stück ab', async () => {
    await failsWith(
      issue('ffnd', { personId: 'p1', datum: '2026-10-08', stueckIds: ['s1', 's2'], mengen: [] }),
      'alreadyIssued:s2'
    );
    expect(get('bekleidungStueck/s1')?.status).toBe('lager');
  });

  it('lehnt ein ausgegebenes Stück ohne Ausgabe (Import) ab', async () => {
    await failsWith(
      issue('ffnd', { personId: 'p1', datum: '2026-10-08', stueckIds: ['s3'], mengen: [] }),
      'alreadyIssued:s3'
    );
  });

  it('meldet ein ausgeschiedenes Stück als nicht verfügbar statt als ausgegeben', async () => {
    fake.put(`${G}/bekleidungStueck/s9`, {
      artikelId: 'jacke',
      groesse: 'M3',
      eigentum: 'feuerwehr',
      status: 'ausgeschieden',
      waschgaenge: 0,
      waschgaengeAltbestand: 0,
      ...STAMPS,
    });
    await failsWith(
      issue('ffnd', { personId: 'p1', datum: '2026-10-08', stueckIds: ['s9'], mengen: [] }),
      'notAvailable:s9:ausgeschieden',
    );
  });

  it('lehnt eine Menge über dem Bestand ab und schreibt nichts', async () => {
    const before = list('bekleidungAusgabe').length;
    await failsWith(
      issue('ffnd', {
        personId: 'p1',
        datum: '2026-10-08',
        stueckIds: ['s1'],
        mengen: [{ artikelId: 'polo', groesse: 'M', menge: 6 }],
      }),
      'insufficientStock:polo:M'
    );
    expect(list('bekleidungAusgabe')).toHaveLength(before);
    expect(get('bekleidungStueck/s1')?.status).toBe('lager');
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'M')}`)?.anzahl).toBe(5);
  });

  it('lehnt eine Größe ohne Bestand ab', async () => {
    await failsWith(
      issue('ffnd', {
        personId: 'p1',
        datum: '2026-10-08',
        stueckIds: [],
        mengen: [{ artikelId: 'polo', groesse: 'XL', menge: 1 }],
      }),
      'insufficientStock:polo:XL'
    );
  });

  it('lehnt eine inaktive Person ab', async () => {
    await failsWith(
      issue('ffnd', { personId: 'p2', datum: '2026-10-08', stueckIds: ['s1'], mengen: [] }),
      'personInactive'
    );
  });

  it('lehnt eine Person einer fremden Gruppe ab', async () => {
    fake.put('groups/other/person/p9', { name: 'Hans Beispiel', active: true });
    await failsWith(
      issue('ffnd', { personId: 'p9', datum: '2026-10-08', stueckIds: ['s1'], mengen: [] })
    );
    expect(get('bekleidungStueck/s1')?.status).toBe('lager');
  });

  it('lehnt ein ungültiges Datum ab', async () => {
    await failsWith(
      issue('ffnd', { personId: 'p1', datum: '8.10.2026', stueckIds: ['s1'], mengen: [] })
    );
  });

  it('lehnt unsichere IDs ab', async () => {
    await failsWith(
      issue('ffnd', { personId: 'p1', datum: '2026-10-08', stueckIds: ['../x'], mengen: [] })
    );
  });
});

describe('returnItems', () => {
  it('teilt eine Teilrücknahme einer Menge auf und erhöht den Bestand', async () => {
    ok(await returnItems('ffnd', {
      datum: '2026-10-08',
      bemerkung: 'zu klein',
      ziel: 'lager',
      stueckIds: [],
      mengen: [{ ausgabeId: 'au2', menge: 2 }],
    }));
    const original = get('bekleidungAusgabe/au2')!;
    expect(original.menge).toBe(1);
    expect(original.zurueckAm).toBeUndefined();

    const closed = list('bekleidungAusgabe').filter(
      (a) => a.artikelId === 'polo' && a.zurueckAm,
    );
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      personId: 'p1',
      groesse: 'M',
      menge: 2,
      ausgegebenAm: '2025-03-01',
      zurueckAm: '2026-10-08',
      bemerkung: 'Sommer; zu klein',
      createdBy: 'u1',
    });
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'M')}`)?.anzahl).toBe(7);
  });

  it('schließt eine vollständig zurückgenommene Menge', async () => {
    ok(await returnItems('ffnd', {
      datum: '2026-10-08',
      ziel: 'ausgeschieden',
      stueckIds: [],
      mengen: [{ ausgabeId: 'au2', menge: 3 }],
    }));
    expect(get('bekleidungAusgabe/au2')).toMatchObject({ menge: 3, zurueckAm: '2026-10-08' });
    // ausgeschieden: nicht zurück ins Lager
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'M')}`)?.anzahl).toBe(5);
  });

  it('eine private Mengen-Ausgabe wird nur geschlossen, nie ins Lager gebucht', async () => {
    fake.put(`${G}/bekleidungAusgabe/au4`, {
      personId: 'p1',
      artikelId: 'polo',
      groesse: 'M',
      menge: 2,
      eigentum: 'privat',
      quelle: 'import',
      ...STAMPS,
    });
    ok(await returnItems('ffnd', {
      datum: '2026-10-08',
      ziel: 'lager',
      stueckIds: [],
      mengen: [{ ausgabeId: 'au4', menge: 2 }, { ausgabeId: 'au2', menge: 1 }],
    }));
    expect(get('bekleidungAusgabe/au4')).toMatchObject({ zurueckAm: '2026-10-08', menge: 2 });
    // nur die Feuerwehr-Menge aus au2 kommt dazu
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'M')}`)?.anzahl).toBe(6);
  });

  it('lehnt mehr als die ausgegebene Menge ab', async () => {
    await failsWith(
      returnItems('ffnd', {
        datum: '2026-10-08',
        ziel: 'lager',
        stueckIds: [],
        mengen: [{ ausgabeId: 'au2', menge: 4 }],
      })
    );
  });

  it('nimmt ein Stück als ausgeschieden zurück', async () => {
    ok(await returnItems('ffnd', {
      datum: '2026-10-08',
      bemerkung: 'Riss',
      ziel: 'ausgeschieden',
      stueckIds: ['s2'],
      mengen: [],
    }));
    expect(get('bekleidungAusgabe/au1')).toMatchObject({
      zurueckAm: '2026-10-08',
      bemerkung: 'Riss',
    });
    const stueck = get('bekleidungStueck/s2')!;
    expect(stueck.status).toBe('ausgeschieden');
    expect(stueck.personId).toBeUndefined();
    expect(stueck.ausgabeId).toBeUndefined();
    expect(stueck.ausgegebenAm).toBeUndefined();
  });

  it('nimmt ein ausgegebenes Stück ohne Ausgabe (Import) zurück', async () => {
    ok(await returnItems('ffnd', { datum: '2026-10-08', ziel: 'lager', stueckIds: ['s3'], mengen: [] }));
    expect(get('bekleidungStueck/s3')?.status).toBe('lager');
  });

  it('lehnt ein Stück im Lager ab', async () => {
    await failsWith(
      returnItems('ffnd', { datum: '2026-10-08', ziel: 'lager', stueckIds: ['s1'], mengen: [] }),
      'notIssued:s1'
    );
  });

  it('lehnt eine schon geschlossene Ausgabe ab', async () => {
    fake.put(`${G}/bekleidungAusgabe/au3`, {
      personId: 'p1',
      artikelId: 'polo',
      groesse: 'M',
      menge: 1,
      zurueckAm: '2026-01-01',
      quelle: 'app',
      ...STAMPS,
    });
    await failsWith(
      returnItems('ffnd', {
        datum: '2026-10-08',
        ziel: 'lager',
        stueckIds: [],
        mengen: [{ ausgabeId: 'au3', menge: 1 }],
      }),
      'notIssued:au3'
    );
  });
});

describe('setStueckStatus', () => {
  it('schließt die offene Ausgabe', async () => {
    ok(await setStueckStatus('ffnd', 's2', 'nicht_auffindbar', '2026-10-08', 'verloren'));
    expect(get('bekleidungAusgabe/au1')).toMatchObject({
      zurueckAm: '2026-10-08',
      bemerkung: 'verloren',
    });
    const stueck = get('bekleidungStueck/s2')!;
    expect(stueck.status).toBe('nicht_auffindbar');
    expect(stueck.personId).toBeUndefined();
    expect(stueck.ausgabeId).toBeUndefined();
  });

  it('setzt ein Import-Stück ohne Ausgabe zurück', async () => {
    ok(await setStueckStatus('ffnd', 's3', 'lager', '2026-10-08'));
    expect(get('bekleidungStueck/s3')?.status).toBe('lager');
  });

  it('lehnt einen unbekannten Status ab', async () => {
    await failsWith(
      setStueckStatus('ffnd', 's1', 'ausgegeben' as never, '2026-10-08')
    );
  });
});

describe('recordWaesche', () => {
  it('zählt die Wäsche je Stück und setzt das letzte Datum', async () => {
    const { id } = ok(await recordWaesche('ffnd', {
      datum: '2026-10-08',
      programm: 'impraegnierung',
      stueckIds: ['s1', 's2', 's1'],
    }));
    expect(get(`bekleidungWaesche/${id}`)).toMatchObject({
      datum: '2026-10-08',
      programm: 'impraegnierung',
      stueckIds: ['s1', 's2'],
      createdBy: 'u1',
    });
    expect(get('bekleidungStueck/s1')).toMatchObject({
      waschgaenge: 1,
      letzteWaescheAm: '2026-10-08',
    });
    // Ein späteres Datum bleibt stehen
    expect(get('bekleidungStueck/s2')).toMatchObject({
      waschgaenge: 4,
      letzteWaescheAm: '2026-12-01',
    });
  });

  it('verlangt bei „sonstiges" einen Text', async () => {
    await failsWith(
      recordWaesche('ffnd', { datum: '2026-10-08', programm: 'sonstiges', stueckIds: ['s1'] }),
      'programmTextRequired'
    );
  });

  it('lehnt mehr als 200 Stücke ab', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `x${i}`);
    await failsWith(
      recordWaesche('ffnd', { datum: '2026-10-08', programm: 'standard', stueckIds: ids })
    );
  });

  it('lehnt ein unbekanntes Stück ab', async () => {
    await failsWith(
      recordWaesche('ffnd', { datum: '2026-10-08', programm: 'standard', stueckIds: ['nope'] })
    );
  });
});

describe('createStuecke / updateStueck', () => {
  it('legt mehrere Stücke ohne Tag-Nummer an', async () => {
    const { ids } = ok(await createStuecke('ffnd', {
      artikelId: 'jacke',
      groesse: ' L ',
      eigentum: 'feuerwehr',
      anzahl: 3,
    }));
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(get(`bekleidungStueck/${id}`)).toMatchObject({
        artikelId: 'jacke',
        groesse: 'L',
        status: 'lager',
        waschgaenge: 0,
        waschgaengeAltbestand: 0,
        createdBy: 'u1',
      });
    }
  });

  it('normalisiert die Tag-Nummer und lehnt eine doppelte ab', async () => {
    const { ids } = ok(await createStuecke('ffnd', {
      artikelId: 'jacke',
      groesse: 'L',
      eigentum: 'feuerwehr',
      tagNummer: ' 2000.0 ',
      anzahl: 1,
    }));
    expect(get(`bekleidungStueck/${ids[0]}`)?.tagNummer).toBe('2000');
    await failsWith(
      createStuecke('ffnd', {
        artikelId: 'jacke',
        groesse: 'L',
        eigentum: 'feuerwehr',
        tagNummer: '1001',
        anzahl: 1,
      }),
      'tagExists:1001'
    );
  });

  it('lehnt eine Tag-Nummer bei mehreren Stücken ab', async () => {
    await failsWith(
      createStuecke('ffnd', {
        artikelId: 'jacke',
        groesse: 'L',
        eigentum: 'feuerwehr',
        tagNummer: '3000',
        anzahl: 2,
      })
    );
  });

  it('lehnt Stücke für einen Mengenartikel ab', async () => {
    await failsWith(
      createStuecke('ffnd', { artikelId: 'polo', groesse: 'L', eigentum: 'feuerwehr', anzahl: 1 })
    );
  });

  it('updateStueck lehnt eine fremde Tag-Nummer ab, behält die eigene', async () => {
    await failsWith(
      updateStueck('ffnd', 's1', { groesse: 'M3', eigentum: 'feuerwehr', tagNummer: '1002' }),
      'tagExists:1002'
    );
    ok(await updateStueck('ffnd', 's1', {
      groesse: 'L3',
      eigentum: 'privat',
      tagNummer: '1001',
      lagerort: 'Spind 4',
    }));
    expect(get('bekleidungStueck/s1')).toMatchObject({
      groesse: 'L3',
      eigentum: 'privat',
      tagNummer: '1001',
      lagerort: 'Spind 4',
      updatedBy: 'u1',
    });
  });

  it('updateStueck zieht eine geänderte Größe in der offenen Ausgabe nach', async () => {
    ok(await updateStueck('ffnd', 's2', { groesse: 'L3', eigentum: 'feuerwehr', tagNummer: '1002' }));
    expect(get('bekleidungStueck/s2')?.groesse).toBe('L3');
    expect(get('bekleidungAusgabe/au1')).toMatchObject({ groesse: 'L3', updatedBy: 'u1' });
  });

  it('updateStueck lässt eine geschlossene Ausgabe unberührt', async () => {
    fake.put(`${G}/bekleidungAusgabe/au1`, {
      ...get('bekleidungAusgabe/au1'),
      zurueckAm: '2026-01-01',
    });
    ok(await updateStueck('ffnd', 's2', { groesse: 'L3', eigentum: 'feuerwehr', tagNummer: '1002' }));
    expect(get('bekleidungAusgabe/au1')?.groesse).toBe('M3');
  });

  it('updateStueck entfernt geleerte Felder', async () => {
    ok(await updateStueck('ffnd', 's1', { groesse: 'M3', eigentum: 'feuerwehr', tagNummer: '' }));
    expect(get('bekleidungStueck/s1')?.tagNummer).toBeUndefined();
  });
});

describe('saveArtikel', () => {
  it('legt einen Artikel an', async () => {
    const { id } = ok(await saveArtikel('ffnd', undefined, {
      kategorie: 'dienst',
      bezeichnung: ' Hemd ',
      hersteller: '',
      fuehrung: 'menge',
      aktiv: true,
    }));
    const doc = get(`bekleidungArtikel/${id}`)!;
    expect(doc).toMatchObject({
      kategorie: 'dienst',
      bezeichnung: 'Hemd',
      fuehrung: 'menge',
      aktiv: true,
      createdBy: 'u1',
    });
    expect(doc.hersteller).toBeUndefined();
  });

  it('lehnt einen Wechsel der Führung bei vorhandenen Stücken ab', async () => {
    await failsWith(
      saveArtikel('ffnd', 'jacke', {
        kategorie: 'einsatz',
        bezeichnung: 'Branddienst Jacke',
        fuehrung: 'menge',
        aktiv: true,
      }),
      'fuehrungLocked'
    );
  });

  it('lehnt einen Wechsel der Führung bei vorhandenem Bestand ab', async () => {
    await failsWith(
      saveArtikel('ffnd', 'polo', {
        kategorie: 'dienst',
        bezeichnung: 'Polo',
        fuehrung: 'einzeln',
        aktiv: true,
      }),
      'fuehrungLocked'
    );
  });

  it('ändert einen Artikel ohne Führungswechsel', async () => {
    ok(await saveArtikel('ffnd', 'jacke', {
      kategorie: 'einsatz',
      bezeichnung: 'Branddienst Jacke neu',
      fuehrung: 'einzeln',
      aktiv: false,
    }));
    const doc = get('bekleidungArtikel/jacke')!;
    expect(doc).toMatchObject({ bezeichnung: 'Branddienst Jacke neu', aktiv: false });
    expect(doc.maxWaschgaenge).toBeUndefined();
    expect(doc.createdBy).toBe('u0');
  });
});

describe('adjustBestand', () => {
  it('bucht Zugang und lehnt einen negativen Bestand ab', async () => {
    ok(await adjustBestand('ffnd', { artikelId: 'polo', groesse: 'xl', delta: 4 }));
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'XL')}`)).toMatchObject({
      artikelId: 'polo',
      groesse: 'XL',
      anzahl: 4,
    });
    await failsWith(
      adjustBestand('ffnd', { artikelId: 'polo', groesse: 'M', delta: -6 }),
      'insufficientStock:polo:M'
    );
    expect(get(`bekleidungBestand/${bestandDocId('polo', 'M')}`)?.anzahl).toBe(5);
  });
});

describe('createPersonForBekleidung', () => {
  it('legt eine aktive Person an', async () => {
    const { id } = ok(await createPersonForBekleidung('ffnd', ' Hans  Beispiel '));
    expect(get(`person/${id}`)).toMatchObject({
      name: 'Hans Beispiel',
      active: true,
      blaulichtSmsRecipientId: '',
      createdBy: 'u1',
    });
  });

  it('lehnt einen schon vorhandenen Namen ab', async () => {
    await failsWith(createPersonForBekleidung('ffnd', 'max  MUSTERMANN'), 'personExists');
  });
});

// --- Import ------------------------------------------------------------------

const BLOCK = ['ausgegeben an', 'ausgegeben an', 'ausgegeben am', 'zurück am'];
const EINSATZ_HEADER = [
  'Hersteller', 'Art', 'Charge', 'Tag Nummer', 'Größe', 'Status aktuell', 'Waschgänge',
  ...BLOCK, ...BLOCK,
];
const DIENST_HEADER = [
  'Hersteller', 'Artikel', 'Charge', 'Tag Nummer', 'Größe', 'Bemerkung', 'Status aktuell',
  ...BLOCK, ...BLOCK,
];

function pad(row: string[], length: number): string[] {
  return [...row, ...Array<string>(Math.max(0, length - row.length)).fill('')];
}

function workbook(): string {
  const sheets = {
    [SHEET_EINSATZ]: [
      ['Bestandsliste'],
      EINSATZ_HEADER,
      pad(
        ['Texport', 'Jacke', '', '22081702', 'M3', 'ausgegeben', '5', 'Mustermann', 'Max', '45250', ''],
        EINSATZ_HEADER.length,
      ),
      pad(
        ['Texport', 'Jacke', '', '22081703', 'L', 'lager', '', 'Musterfrau', 'Erika', '44378', '45250'],
        EINSATZ_HEADER.length,
      ),
    ],
    [SHEET_DIENST]: [
      DIENST_HEADER,
      pad(['Fa. X', 'Hemd', '', '', 'M', '', 'lager'], DIENST_HEADER.length),
      pad(['Fa. X', 'Hemd', '', '', 'm', '', 'Lager'], DIENST_HEADER.length),
      pad(
        ['Fa. X', 'Hemd', '', '', 'L', '', 'ausgegeben', 'Mustermann', 'Max', '45250', ''],
        DIENST_HEADER.length,
      ),
    ],
  };
  return Buffer.from(JSON.stringify(sheets), 'utf-8').toString('base64');
}

function clearBekleidung() {
  for (const path of [...fake.docs.keys()]) {
    if (path.startsWith(`${G}/bekleidung`)) fake.docs.delete(path);
  }
}

describe('previewBekleidungImport', () => {
  it('liefert die Vorschau mit Personenabgleich', async () => {
    const preview = ok(await previewBekleidungImport('ffnd', workbook()));
    expect(preview.rows).toHaveLength(5);
    expect(preview.artikel.map((a) => a.fuehrung).sort()).toEqual(['einzeln', 'menge']);
    const max = preview.persons.find((p) => p.key === 'max mustermann')!;
    expect(max.match).toMatchObject({ status: 'matched', personId: 'p1' });
    expect(JSON.parse(JSON.stringify(preview))).toEqual(preview);
  });

  it('lehnt eine zu große Datei ab', async () => {
    await failsWith(
      previewBekleidungImport('ffnd', 'A'.repeat(Math.ceil((BEKLEIDUNG_IMPORT_MAX_BYTES * 4) / 3) + 8)),
      'fileTooLarge',
    );
  });
});

describe('importBekleidung', () => {
  const decisions = {
    fuehrung: {},
    persons: {
      'max mustermann': { personId: 'p1' },
      'erika musterfrau': { create: 'Erika Beispiel' },
    },
  };

  it('lehnt den Import in einen nicht leeren Bestand ab', async () => {
    await failsWith(importBekleidung('ffnd', workbook(), decisions), 'notEmpty');
  });

  it('lehnt eine Person außerhalb der Gruppe ab', async () => {
    clearBekleidung();
    await failsWith(
      importBekleidung('ffnd', workbook(), {
        ...decisions,
        persons: { ...decisions.persons, 'max mustermann': { personId: 'p9' } },
      })
    );
    expect(list('bekleidungArtikel')).toHaveLength(0);
  });

  it('lehnt fehlende Personen-Entscheidungen ab', async () => {
    clearBekleidung();
    await failsWith(
      importBekleidung('ffnd', workbook(), { fuehrung: {}, persons: {} })
    );
  });

  it('schreibt Artikel, Stücke, Bestand und Ausgaben verknüpft', async () => {
    clearBekleidung();
    const result = ok(await importBekleidung('ffnd', workbook(), decisions));
    expect(result).toEqual({ artikel: 2, stuecke: 2, ausgaben: 3, personsCreated: 1 });

    const persons = list('person');
    const erika = persons.find((p) => p.name === 'Erika Beispiel')!;
    expect(erika).toMatchObject({ active: true, createdBy: 'u1' });

    const artikel = list('bekleidungArtikel');
    const jacke = artikel.find((a) => a.bezeichnung === 'Jacke')!;
    const hemd = artikel.find((a) => a.bezeichnung === 'Hemd')!;
    expect(jacke).toMatchObject({ fuehrung: 'einzeln', kategorie: 'einsatz', createdBy: 'u1' });
    expect(hemd).toMatchObject({ fuehrung: 'menge', kategorie: 'dienst' });

    const stuecke = list('bekleidungStueck');
    const issued = stuecke.find((s) => s.tagNummer === '22081702')!;
    expect(issued).toMatchObject({
      artikelId: jacke.id,
      status: 'ausgegeben',
      personId: 'p1',
      ausgegebenAm: '2023-11-20',
      waschgaengeAltbestand: 5,
      waschgaenge: 0,
    });
    const openAusgabe = get(`bekleidungAusgabe/${issued.ausgabeId as string}`)!;
    expect(openAusgabe).toMatchObject({
      stueckId: issued.id,
      personId: 'p1',
      artikelId: jacke.id,
      quelle: 'import',
    });
    expect(openAusgabe.zurueckAm).toBeUndefined();

    const inStock = stuecke.find((s) => s.tagNummer === '22081703')!;
    expect(inStock.status).toBe('lager');
    expect(inStock.personId).toBeUndefined();
    const erikaAusgabe = list('bekleidungAusgabe').find((a) => a.stueckId === inStock.id)!;
    expect(erikaAusgabe).toMatchObject({
      personId: erika.id,
      ausgegebenAm: '2021-07-01',
      zurueckAm: '2023-11-20',
    });

    expect(get(`bekleidungBestand/${bestandDocId(hemd.id as string, 'M')}`)).toMatchObject({
      artikelId: hemd.id,
      groesse: 'M',
      anzahl: 2,
    });
    const hemdAusgabe = list('bekleidungAusgabe').find((a) => a.artikelId === hemd.id)!;
    expect(hemdAusgabe).toMatchObject({ personId: 'p1', groesse: 'L', menge: 1 });
    expect(hemdAusgabe.stueckId).toBeUndefined();
  });

  it('setzt nach Erfolg die Importsperre auf „done" mit Zählern', async () => {
    clearBekleidung();
    ok(await importBekleidung('ffnd', workbook(), decisions));
    expect(get('bekleidungMeta/import')).toMatchObject({
      state: 'done',
      startedBy: 'u1',
      counts: { artikel: 2, stuecke: 2, ausgaben: 3, personsCreated: 1 },
    });
    expect(get('bekleidungMeta/import')?.finishedAt).toEqual(expect.any(String));
  });

  it('lehnt einen Import ab, solange ein anderer läuft', async () => {
    clearBekleidung();
    fake.put(`${G}/bekleidungMeta/import`, { state: 'running', startedAt: 'x', startedBy: 'u9' });
    await failsWith(importBekleidung('ffnd', workbook(), decisions), 'importRunning');
    expect(list('bekleidungArtikel')).toHaveLength(0);
  });

  it('lehnt einen zweiten Import nach einem abgeschlossenen ab', async () => {
    clearBekleidung();
    fake.put(`${G}/bekleidungMeta/import`, { state: 'done', finishedAt: 'x' });
    await failsWith(importBekleidung('ffnd', workbook(), decisions), 'notEmpty');
  });

  it('zwei gleichzeitige Importe: nur einer schreibt', async () => {
    clearBekleidung();
    const results = await Promise.all([
      importBekleidung('ffnd', workbook(), decisions),
      importBekleidung('ffnd', workbook(), decisions),
    ]);
    const failed = results.filter(
      (r) => r && typeof r === 'object' && 'success' in r && r.success === false,
    ) as BekleidungActionError[];
    expect(failed).toHaveLength(1);
    expect(['importRunning', 'notEmpty']).toContain(failed[0].error);
    expect(list('bekleidungArtikel')).toHaveLength(2);
    expect(list('person').filter((p) => p.name === 'Erika Beispiel')).toHaveLength(1);
  });

  it('eine Gruppe nur mit Wäschen gilt nicht als leer', async () => {
    clearBekleidung();
    fake.put(`${G}/bekleidungWaesche/w1`, {
      datum: '2026-01-01',
      programm: 'standard',
      stueckIds: [],
      createdAt: STAMPS.createdAt,
      createdBy: 'u0',
    });
    await failsWith(importBekleidung('ffnd', workbook(), decisions), 'notEmpty');
  });

  it('rollt bei einem Fehler beim Schreiben alles zurück und gibt die Sperre frei', async () => {
    clearBekleidung();
    const personsBefore = list('person').map((p) => p.id).sort();
    fake.failBatchCommit(1);
    await expect(importBekleidung('ffnd', workbook(), decisions)).rejects.toThrow(
      /DEADLINE_EXCEEDED/,
    );
    for (const col of [
      'bekleidungArtikel',
      'bekleidungStueck',
      'bekleidungBestand',
      'bekleidungAusgabe',
      'bekleidungMeta',
    ]) {
      expect(list(col)).toEqual([]);
    }
    expect(list('person').map((p) => p.id).sort()).toEqual(personsBefore);
    // danach geht ein neuer Versuch durch
    ok(await importBekleidung('ffnd', workbook(), decisions));
  });

  it('lehnt eine neu anzulegende Person ab, die es in der Gruppe schon gibt', async () => {
    clearBekleidung();
    await failsWith(
      importBekleidung('ffnd', workbook(), {
        fuehrung: {},
        persons: {
          'max mustermann': { personId: 'p1' },
          'erika musterfrau': { create: 'erika  MUSTERFRAU' },
        },
      }),
      'personExists',
    );
    expect(list('bekleidungArtikel')).toHaveLength(0);
  });

  it('lehnt zwei gleichnamige neue Personen im selben Import ab', async () => {
    clearBekleidung();
    await failsWith(
      importBekleidung('ffnd', workbook(), {
        fuehrung: {},
        persons: {
          'max mustermann': { create: 'Hans Beispiel' },
          'erika musterfrau': { create: 'hans beispiel' },
        },
      }),
      'personExists',
    );
  });
});
