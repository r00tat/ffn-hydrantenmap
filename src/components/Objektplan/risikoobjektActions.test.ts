import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RisikoObjekt } from '../../common/gis-objects';
import type { GroupRoles } from '../../common/permissions';

vi.mock('server-only', () => ({}));

const store = vi.hoisted(() => ({
  objekte: new Map<string, RisikoObjekt & { id: string }>(),
  saved: [] as Array<{ id: string; patch: Partial<RisikoObjekt> }>,
  storageGroups: [] as Array<{ id: string; groups: string[] }>,
  deleted: [] as string[],
  dokumentDeleted: [] as string[],
  dokumente: new Map<
    string,
    { id: string; quelle?: 'drive'; storagePath: string; contentType?: string; indexStatus?: string; ocr?: boolean; seitenText?: string[]; melder?: unknown[] }
  >(),
  dokumentWritten: [] as Array<Record<string, unknown>>,
}));

const ocr = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../../server/objektplan/ocrDokument', () => ({
  ocrStoragePdf: (path: string, key: string) => ocr.run(path, key),
}));

const reindex = vi.hoisted(() => ({ run: vi.fn(), key: '' }));
vi.mock('../../server/objektplan/reindexDeps', () => ({
  reindexDeps: (key: string) => {
    reindex.key = key;
    return { marker: 'deps' };
  },
}));
vi.mock('../../server/objektplan/reindexRunner', () => ({
  reindexDokument: (d: unknown, deps: unknown) => reindex.run(d, deps),
}));

vi.mock('../../server/objektplan/risikoobjektStore', () => ({
  loadObjektDokumentSummaries: async (objektId: string) =>
    [...store.dokumente.values()]
      .filter((d) => d.storagePath.startsWith(`risikoobjekt/${objektId}/`))
      .map((d) => ({ ...d, name: `${d.id}.pdf` })),
  loadRisikoObjekt: async (id: string) => store.objekte.get(id),
  loadAllRisikoObjekte: async () => [...store.objekte.values()],
  newRisikoObjektId: () => 'neu1',
  saveRisikoObjekt: async (id: string, patch: Partial<RisikoObjekt>) => {
    store.saved.push({ id, patch });
    const next = { ...store.objekte.get(id), ...patch, id } as RisikoObjekt & { id: string };
    store.objekte.set(id, next);
    return next;
  },
  writeStorageGroups: async (id: string, groups: string[]) => {
    store.storageGroups.push({ id, groups });
    return 1;
  },
  deleteRisikoObjektCompletely: async (o: { id: string }) => {
    store.deleted.push(o.id);
  },
  loadObjektDokument: async (_objektId: string, dokumentId: string) =>
    store.dokumente.get(dokumentId),
  deleteObjektDokumentCompletely: async (_objektId: string, d: { id: string }) => {
    store.dokumentDeleted.push(d.id);
  },
  writeObjektDokument: async (_objektId: string, d: Record<string, unknown>) => {
    store.dokumentWritten.push(d);
  },
}));

const session = vi.hoisted(() => ({
  user: { isAdmin: false, groupRoles: {} as GroupRoles, email: 'gruppenadmin@example.org' },
}));

vi.mock('../../app/auth', async () => {
  const { can } = await import('../../common/permissions');
  return {
    actionUserRequired: async () => session,
    actionAdminRequired: async () => {
      if (!session.user.isAdmin) throw new Error('admin required');
      return session;
    },
    actionPermissionRequired: async (groupId: string, perm: 'risikoobjekte.manage') => {
      if (!can(session.user, groupId, perm)) throw new Error('forbidden');
      return session;
    },
  };
});

import {
  createRisikoObjekt,
  deleteObjektDokumentAction,
  deleteRisikoObjekt,
  listObjektDokumenteForReindex,
  ocrObjektDokumentAction,
  reindexObjektDokumentAction,
  setRisikoObjektGroups,
  shareUnsharedRisikoObjekte,
  updateRisikoObjekt,
} from './risikoobjektActions';

const input = {
  name: 'Lagerhalle',
  ortschaft: 'ND',
  adresse: 'Industriestraße 1',
  risikogruppe: 'Lager',
  einsatzplanummer: '17',
  description: '',
  link: '',
  lat: 47.94,
  lng: 16.84,
};

function gis(id: string, groups?: string[]): RisikoObjekt & { id: string } {
  return {
    id,
    name: id,
    lat: 47.9,
    lng: 16.8,
    adresse: '',
    einsatzplanummer: '',
    erfassungsdatum: '',
    ortschaft: 'ND',
    risikogruppe: '',
    ...(groups ? { groups } : {}),
  };
}

beforeEach(() => {
  store.objekte.clear();
  store.saved.length = 0;
  store.storageGroups.length = 0;
  store.deleted.length = 0;
  store.dokumentDeleted.length = 0;
  store.dokumente.clear();
  store.dokumentWritten.length = 0;
  ocr.run.mockReset();
  reindex.run.mockReset();
  session.user.isAdmin = false;
  session.user.groupRoles = { a: ['gruppenadmin'], b: [] };
});

describe('createRisikoObjekt', () => {
  it('legt ein Objekt für die Gruppe an', async () => {
    const result = await createRisikoObjekt('a', input);
    expect(result).toEqual({ ok: true, id: 'neu1' });
    expect(store.objekte.get('neu1')).toMatchObject({
      name: 'Lagerhalle',
      groups: ['a'],
      quelle: 'app',
      createdBy: 'gruppenadmin@example.org',
    });
  });

  it('verlangt das Recht in der Gruppe', async () => {
    await expect(createRisikoObjekt('b', input)).rejects.toThrow();
    expect(store.saved).toHaveLength(0);
  });

  it('meldet ungültige Eingaben', async () => {
    expect(await createRisikoObjekt('a', { ...input, name: '' })).toEqual({ ok: false, error: 'name' });
  });
});

describe('updateRisikoObjekt', () => {
  it('ändert ein in der App angelegtes Objekt vollständig', async () => {
    store.objekte.set('x', { ...gis('x', ['a']), quelle: 'app' });
    expect(await updateRisikoObjekt('x', { ...input, name: 'Neu' })).toEqual({ ok: true, id: 'x' });
    expect(store.objekte.get('x')?.name).toBe('Neu');
  });

  it('ändert bei Objekten aus dem GIS-Import nur den Link', async () => {
    store.objekte.set('g', gis('g', ['a']));
    await updateRisikoObjekt('g', { ...input, name: 'Anders', link: 'https://drive.google.com/x' });
    expect(store.saved).toEqual([{ id: 'g', patch: { link: 'https://drive.google.com/x' } }]);
  });

  it('weist ab, wer das Objekt nicht pflegt', async () => {
    store.objekte.set('x', { ...gis('x', ['b']), quelle: 'app' });
    expect(await updateRisikoObjekt('x', input)).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('deleteRisikoObjekt', () => {
  it('löscht nur in der App angelegte Objekte', async () => {
    store.objekte.set('x', { ...gis('x', ['a']), quelle: 'app' });
    store.objekte.set('g', gis('g', ['a']));
    expect(await deleteRisikoObjekt('x')).toEqual({ ok: true, id: 'x' });
    expect(await deleteRisikoObjekt('g')).toEqual({ ok: false, error: 'notApp' });
    expect(store.deleted).toEqual(['x']);
  });
});

describe('setRisikoObjektGroups', () => {
  it('ändert die Freigabe und schreibt sie an die Dateien', async () => {
    session.user.groupRoles = { a: ['gruppenadmin'], b: ['gruppenadmin'] };
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('g', ['b', 'a'])).toEqual({ ok: true, id: 'g' });
    expect(store.objekte.get('g')?.groups).toEqual(['a', 'b']);
    expect(store.storageGroups).toEqual([{ id: 'g', groups: ['a', 'b'] }]);
  });

  it('lässt keine Gruppe ohne eigenes Recht hinzufügen', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('g', ['a', 'c'])).toEqual({ ok: false, error: 'forbidden' });
    expect(store.storageGroups).toHaveLength(0);
  });

  it('lässt die letzte Freigabe nicht entfernen', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('g', [])).toEqual({ ok: false, error: 'empty' });
  });

  it('verlangt, dass der Benutzer das Objekt pflegt', async () => {
    store.objekte.set('g', gis('g', ['c']));
    expect(await setRisikoObjektGroups('g', ['a', 'c'])).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('shareUnsharedRisikoObjekte', () => {
  it('gibt alle Objekte ohne Freigabe an die gewählten Gruppen frei', async () => {
    session.user.isAdmin = true;
    store.objekte.set('g1', gis('g1'));
    store.objekte.set('g2', gis('g2', ['c']));
    expect(await shareUnsharedRisikoObjekte(['a'])).toEqual({ ok: true, count: 1 });
    expect(store.objekte.get('g1')?.groups).toEqual(['a']);
    expect(store.objekte.get('g2')?.groups).toEqual(['c']);
    expect(store.storageGroups).toEqual([{ id: 'g1', groups: ['a'] }]);
  });

  it('ist dem Admin vorbehalten', async () => {
    await expect(shareUnsharedRisikoObjekte(['a'])).rejects.toThrow();
  });
});

describe('deleteObjektDokumentAction', () => {
  it('löscht hochgeladene Unterlagen, keine aus Drive', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', { id: 'd1', storagePath: 'risikoobjekt/g/d1-x.pdf' });
    store.dokumente.set('d2', { id: 'd2', quelle: 'drive', storagePath: 'risikoobjekt/g/d2-x.pdf' });
    expect(await deleteObjektDokumentAction('g', 'd1')).toEqual({ ok: true, id: 'd1' });
    expect(await deleteObjektDokumentAction('g', 'd2')).toEqual({ ok: false, error: 'forbidden' });
    expect(store.dokumentDeleted).toEqual(['d1']);
  });

  it('verlangt das Pflegerecht am Objekt', async () => {
    store.objekte.set('g', gis('g', ['b']));
    store.dokumente.set('d1', { id: 'd1', storagePath: 'risikoobjekt/g/d1-x.pdf' });
    expect(await deleteObjektDokumentAction('g', 'd1')).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('ocrObjektDokumentAction', () => {
  const scan = {
    id: 'd1',
    storagePath: 'risikoobjekt/g/d1-scan.pdf',
    contentType: 'application/pdf',
    indexStatus: 'ohneText',
  };

  it('erkennt den Text eines Scans und speichert ihn am Dokument', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', scan);
    ocr.run.mockResolvedValue({ seiten: 1, seitenText: ['Melder 1/02'], melder: [], textGekuerzt: false });
    expect(await ocrObjektDokumentAction('g', 'd1')).toEqual({
      ok: true,
      id: 'd1',
      hasText: true,
      melder: 0,
    });
    expect(ocr.run).toHaveBeenCalledWith('risikoobjekt/g/d1-scan.pdf', 'g_d1');
    expect(store.dokumentWritten[0]).toMatchObject({ indexStatus: 'ok', ocr: true });
  });

  it('erkennt auch ein PDF mit Textebene ohne Melder und behält dessen Text', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', { ...scan, indexStatus: 'ok', seitenText: ['LEGENDE'], melder: [] });
    ocr.run.mockResolvedValue({
      seiten: 1,
      seitenText: ['1003/04'],
      melder: [{ kennung: '1003/04', gruppe: 1003, melder: 4, seite: 1, box: [0, 0, 0.1, 0.1] }],
      textGekuerzt: false,
    });
    expect(await ocrObjektDokumentAction('g', 'd1')).toEqual({ ok: true, id: 'd1', hasText: true, melder: 1 });
    expect(store.dokumentWritten[0]).toMatchObject({ seitenText: ['LEGENDE\n1003/04'], ocr: true });
  });

  it('nimmt nur PDFs ohne Melder, die noch nicht erkannt wurden', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', {
      ...scan,
      indexStatus: 'ok',
      melder: [{ kennung: '1/02', gruppe: 1, melder: 2, seite: 1, box: [0, 0, 1, 1] }],
    });
    store.dokumente.set('d2', { ...scan, id: 'd2', ocr: true });
    store.dokumente.set('d3', { ...scan, id: 'd3', contentType: 'image/jpeg', indexStatus: 'bild' });
    for (const id of ['d1', 'd2', 'd3']) {
      expect(await ocrObjektDokumentAction('g', id)).toEqual({ ok: false, error: 'notScan' });
    }
    expect(ocr.run).not.toHaveBeenCalled();
  });

  it('meldet ein Scheitern der Erkennung', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', scan);
    ocr.run.mockRejectedValue(new Error('Vision'));
    expect(await ocrObjektDokumentAction('g', 'd1')).toEqual({ ok: false, error: 'ocrFailed' });
  });

  it('verlangt das Pflegerecht am Objekt', async () => {
    store.objekte.set('g', gis('g', ['b']));
    store.dokumente.set('d1', scan);
    expect(await ocrObjektDokumentAction('g', 'd1')).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('reindexObjektDokumentAction', () => {
  const plan = {
    id: 'd1',
    storagePath: 'risikoobjekt/g/d1-plan.pdf',
    contentType: 'application/pdf',
    indexStatus: 'ok',
    ocr: true,
    melder: [],
  };

  it('liest das Dokument neu ein und speichert das Ergebnis', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', plan);
    reindex.run.mockResolvedValue({
      ...plan,
      ocr: true,
      melder: [{ kennung: '1003/04' }, { kennung: '1003/05' }],
    });
    expect(await reindexObjektDokumentAction('g', 'd1')).toEqual({
      ok: true,
      id: 'd1',
      indexStatus: 'ok',
      melder: 2,
      ocr: true,
    });
    expect(reindex.run).toHaveBeenCalledWith(plan, { marker: 'deps' });
    expect(reindex.key).toBe('g_d1');
    expect(store.dokumentWritten[0]).toMatchObject({ id: 'd1', ocr: true });
  });

  it('meldet ein Scheitern und lässt das Dokument stehen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', plan);
    reindex.run.mockRejectedValue(new Error('No such object'));
    expect(await reindexObjektDokumentAction('g', 'd1')).toEqual({ ok: false, error: 'reindexFailed' });
    expect(store.dokumentWritten).toHaveLength(0);
  });

  it('verlangt das Pflegerecht am Objekt', async () => {
    store.objekte.set('g', gis('g', ['b']));
    store.dokumente.set('d1', plan);
    expect(await reindexObjektDokumentAction('g', 'd1')).toEqual({ ok: false, error: 'forbidden' });
    expect(reindex.run).not.toHaveBeenCalled();
  });

  it('kennt kein fehlendes Dokument', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await reindexObjektDokumentAction('g', 'dx')).toEqual({ ok: false, error: 'notFound' });
  });
});

describe('listObjektDokumenteForReindex', () => {
  it('ist dem Admin vorbehalten', async () => {
    await expect(listObjektDokumenteForReindex()).rejects.toThrow();
  });

  it('listet alle PDFs mit Melderzahl und Status, die ohne Melder zuerst', async () => {
    session.user.isAdmin = true;
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', {
      id: 'd1',
      storagePath: 'risikoobjekt/g/d1.pdf',
      contentType: 'application/pdf',
      indexStatus: 'ok',
      melder: [{}, {}],
    });
    store.dokumente.set('d2', {
      id: 'd2',
      storagePath: 'risikoobjekt/g/d2.pdf',
      contentType: 'application/pdf',
      indexStatus: 'ohneText',
      ocr: true,
    });
    store.dokumente.set('d3', {
      id: 'd3',
      storagePath: 'risikoobjekt/g/d3.jpg',
      contentType: 'image/jpeg',
      indexStatus: 'bild',
    });
    expect(await listObjektDokumenteForReindex()).toEqual([
      { objektId: 'g', objektName: 'g', dokumentId: 'd2', name: 'd2.pdf', indexStatus: 'ohneText', melder: 0, ocr: true },
      { objektId: 'g', objektName: 'g', dokumentId: 'd1', name: 'd1.pdf', indexStatus: 'ok', melder: 2, ocr: false },
    ]);
  });
});
