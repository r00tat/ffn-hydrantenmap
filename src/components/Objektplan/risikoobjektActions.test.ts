import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RisikoObjekt } from '../../common/gis-objects';
import type { GroupRoles } from '../../common/permissions';

vi.mock('server-only', () => ({}));

const store = vi.hoisted(() => ({
  objekte: new Map<string, RisikoObjekt & { id: string }>(),
  gefahr: new Map<string, RisikoObjekt & { id: string }>(),
  saved: [] as Array<{ id: string; patch: Partial<RisikoObjekt> }>,
  storageGroups: [] as Array<{ art: string; id: string; groups: string[] }>,
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

const driveSync = vi.hoisted(() => ({ run: vi.fn(), groups: [] as string[] }));
vi.mock('../../server/objektplan/driveSyncDeps', () => ({
  driveSyncDeps: (groups: string) => {
    driveSync.groups.push(groups);
    return { marker: 'driveDeps' };
  },
}));
vi.mock('../../server/objektplan/driveSyncRunner', () => ({
  runDriveSync: (ref: { art: string; id: string }, link: string | undefined, deps: unknown) =>
    driveSync.run(ref, link, deps),
}));

vi.mock('../../server/objektplan/risikoobjektStore', () => {
  const objekteOf = (art: string) => (art === 'gefahrobjekt' ? store.gefahr : store.objekte);
  return {
    loadObjektDokumentSummaries: async (art: string, objektId: string) =>
      [...store.dokumente.values()]
        .filter((d) => d.storagePath.startsWith(`${art}/${objektId}/`))
        .map((d) => ({ ...d, name: `${d.id}.pdf` })),
    loadPlanObjekt: async (art: string, id: string) => {
      const o = objekteOf(art).get(id);
      return o && { ...o, art };
    },
    loadAllPlanObjekte: async () => [
      ...[...store.objekte.values()].map((o) => ({ ...o, art: 'risikoobjekt' })),
      ...[...store.gefahr.values()].map((o) => ({ ...o, art: 'gefahrobjekt' })),
    ],
    newRisikoObjektId: () => 'neu1',
    savePlanObjekt: async (art: string, id: string, patch: Partial<RisikoObjekt>) => {
      store.saved.push({ id, patch });
      const next = { ...objekteOf(art).get(id), ...patch, id } as RisikoObjekt & { id: string };
      objekteOf(art).set(id, next);
      return { ...next, art };
    },
    writeStorageGroups: async (art: string, id: string, groups: string[]) => {
      store.storageGroups.push({ art, id, groups });
      return 1;
    },
    deletePlanObjektCompletely: async (o: { id: string }) => {
      store.deleted.push(o.id);
    },
    loadObjektDokument: async (_art: string, _objektId: string, dokumentId: string) =>
      store.dokumente.get(dokumentId),
    deleteObjektDokumentCompletely: async (_art: string, _objektId: string, d: { id: string }) => {
      store.dokumentDeleted.push(d.id);
    },
    writeObjektDokument: async (_art: string, _objektId: string, d: Record<string, unknown>) => {
      store.dokumentWritten.push(d);
    },
  };
});

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
  listPlanObjekteWithDriveLink,
  listObjektDokumenteForReindex,
  ocrObjektDokumentAction,
  reindexObjektDokumentAction,
  setRisikoObjektGroups,
  shareUnsharedRisikoObjekte,
  syncPlanObjekteFromDrive,
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
  store.gefahr.clear();
  store.saved.length = 0;
  store.storageGroups.length = 0;
  store.deleted.length = 0;
  store.dokumentDeleted.length = 0;
  store.dokumente.clear();
  store.dokumentWritten.length = 0;
  ocr.run.mockReset();
  reindex.run.mockReset();
  driveSync.run.mockReset();
  driveSync.groups.length = 0;
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
    expect(await updateRisikoObjekt('risikoobjekt', 'x', { ...input, name: 'Neu' })).toEqual({ ok: true, id: 'x' });
    expect(store.objekte.get('x')?.name).toBe('Neu');
  });

  it('ändert bei Objekten aus dem GIS-Import nur den Link', async () => {
    store.objekte.set('g', gis('g', ['a']));
    await updateRisikoObjekt('risikoobjekt', 'g', { ...input, name: 'Anders', link: 'https://drive.google.com/x' });
    expect(store.saved).toEqual([{ id: 'g', patch: { link: 'https://drive.google.com/x' } }]);
  });

  it('weist ab, wer das Objekt nicht pflegt', async () => {
    store.objekte.set('x', { ...gis('x', ['b']), quelle: 'app' });
    expect(await updateRisikoObjekt('risikoobjekt', 'x', input)).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('deleteRisikoObjekt', () => {
  it('löscht nur in der App angelegte Objekte', async () => {
    store.objekte.set('x', { ...gis('x', ['a']), quelle: 'app' });
    store.objekte.set('g', gis('g', ['a']));
    expect(await deleteRisikoObjekt('risikoobjekt', 'x')).toEqual({ ok: true, id: 'x' });
    expect(await deleteRisikoObjekt('risikoobjekt', 'g')).toEqual({ ok: false, error: 'notApp' });
    expect(store.deleted).toEqual(['x']);
  });
});

describe('setRisikoObjektGroups', () => {
  it('ändert die Freigabe und schreibt sie an die Dateien', async () => {
    session.user.groupRoles = { a: ['gruppenadmin'], b: ['gruppenadmin'] };
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('risikoobjekt', 'g', ['b', 'a'])).toEqual({ ok: true, id: 'g' });
    expect(store.objekte.get('g')?.groups).toEqual(['a', 'b']);
    expect(store.storageGroups).toEqual([{ art: 'risikoobjekt', id: 'g', groups: ['a', 'b'] }]);
  });

  it('lässt keine Gruppe ohne eigenes Recht hinzufügen', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('risikoobjekt', 'g', ['a', 'c'])).toEqual({ ok: false, error: 'forbidden' });
    expect(store.storageGroups).toHaveLength(0);
  });

  it('lässt die letzte Freigabe nicht entfernen', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('risikoobjekt', 'g', [])).toEqual({ ok: false, error: 'empty' });
  });

  it('verlangt, dass der Benutzer das Objekt pflegt', async () => {
    store.objekte.set('g', gis('g', ['c']));
    expect(await setRisikoObjektGroups('risikoobjekt', 'g', ['a', 'c'])).toEqual({ ok: false, error: 'forbidden' });
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
    expect(store.storageGroups).toEqual([{ art: 'risikoobjekt', id: 'g1', groups: ['a'] }]);
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
    expect(await deleteObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: true, id: 'd1' });
    expect(await deleteObjektDokumentAction('risikoobjekt', 'g', 'd2')).toEqual({ ok: false, error: 'forbidden' });
    expect(store.dokumentDeleted).toEqual(['d1']);
  });

  it('verlangt das Pflegerecht am Objekt', async () => {
    store.objekte.set('g', gis('g', ['b']));
    store.dokumente.set('d1', { id: 'd1', storagePath: 'risikoobjekt/g/d1-x.pdf' });
    expect(await deleteObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: false, error: 'forbidden' });
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
    expect(await ocrObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({
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
    expect(await ocrObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: true, id: 'd1', hasText: true, melder: 1 });
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
      expect(await ocrObjektDokumentAction('risikoobjekt', 'g', id)).toEqual({ ok: false, error: 'notScan' });
    }
    expect(ocr.run).not.toHaveBeenCalled();
  });

  it('meldet ein Scheitern der Erkennung', async () => {
    store.objekte.set('g', gis('g', ['a']));
    store.dokumente.set('d1', scan);
    ocr.run.mockRejectedValue(new Error('Vision'));
    expect(await ocrObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: false, error: 'ocrFailed' });
  });

  it('verlangt das Pflegerecht am Objekt', async () => {
    store.objekte.set('g', gis('g', ['b']));
    store.dokumente.set('d1', scan);
    expect(await ocrObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: false, error: 'forbidden' });
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
    expect(await reindexObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({
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
    expect(await reindexObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: false, error: 'reindexFailed' });
    expect(store.dokumentWritten).toHaveLength(0);
  });

  it('verlangt das Pflegerecht am Objekt', async () => {
    store.objekte.set('g', gis('g', ['b']));
    store.dokumente.set('d1', plan);
    expect(await reindexObjektDokumentAction('risikoobjekt', 'g', 'd1')).toEqual({ ok: false, error: 'forbidden' });
    expect(reindex.run).not.toHaveBeenCalled();
  });

  it('kennt kein fehlendes Dokument', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await reindexObjektDokumentAction('risikoobjekt', 'g', 'dx')).toEqual({ ok: false, error: 'notFound' });
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
      { art: 'risikoobjekt', objektId: 'g', objektName: 'g', dokumentId: 'd2', name: 'd2.pdf', indexStatus: 'ohneText', melder: 0, ocr: true },
      { art: 'risikoobjekt', objektId: 'g', objektName: 'g', dokumentId: 'd1', name: 'd1.pdf', indexStatus: 'ok', melder: 2, ocr: false },
    ]);
  });
});

describe('listPlanObjekteWithDriveLink', () => {
  it('ist dem Admin vorbehalten', async () => {
    await expect(listPlanObjekteWithDriveLink()).rejects.toThrow();
  });

  it('listet nur Objekte mit einem Drive-Link, nach Namen sortiert', async () => {
    session.user.isAdmin = true;
    const drive = 'https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N';
    store.objekte.set('b', { ...gis('b', ['a']), name: 'Markt', link: drive });
    store.objekte.set('a', { ...gis('a', ['a']), name: 'Hotel', link: drive });
    store.objekte.set('c', { ...gis('c', ['a']), name: 'Schule', link: 'https://example.com/plan.pdf' });
    store.objekte.set('d', gis('d', ['a']));
    expect(await listPlanObjekteWithDriveLink()).toEqual([
      { art: 'risikoobjekt', id: 'a', name: 'Hotel' },
      { art: 'risikoobjekt', id: 'b', name: 'Markt' },
    ]);
  });
});

describe('syncPlanObjekteFromDrive', () => {
  const refs = (ids: string[]) => ids.map((id) => ({ art: 'risikoobjekt' as const, id }));
  const drive = 'https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N';
  const ok = { status: 'ok', imported: 1, removed: 0, skipped: 2, failed: 0 } as const;

  it('ist dem Admin vorbehalten', async () => {
    await expect(syncPlanObjekteFromDrive(refs(['a']))).rejects.toThrow();
    expect(driveSync.run).not.toHaveBeenCalled();
  });

  it('gleicht die Objekte gleichzeitig ab, nicht nacheinander', async () => {
    session.user.isAdmin = true;
    for (const id of ['a', 'b', 'c']) store.objekte.set(id, { ...gis(id, ['a']), link: drive });
    const pending: Array<() => void> = [];
    driveSync.run.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve(ok))),
    );
    const done = syncPlanObjekteFromDrive(refs(['a', 'b', 'c']));
    // Alle drei laufen, bevor der erste fertig ist.
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending.forEach((resolve) => resolve());
    expect(await done).toEqual([
      { art: 'risikoobjekt', id: 'a', result: ok },
      { art: 'risikoobjekt', id: 'b', result: ok },
      { art: 'risikoobjekt', id: 'c', result: ok },
    ]);
    expect(driveSync.run).toHaveBeenCalledWith({ art: 'risikoobjekt', id: 'a' }, drive, { marker: 'driveDeps' });
    expect(driveSync.groups).toEqual(['a', 'a', 'a']);
  });

  it('meldet einen Fehler je Objekt, ohne die anderen abzubrechen', async () => {
    session.user.isAdmin = true;
    store.objekte.set('a', { ...gis('a', ['a']), link: drive });
    store.objekte.set('b', { ...gis('b', ['a']), link: drive });
    driveSync.run.mockImplementation(async (ref: { id: string }) => {
      if (ref.id === 'a') throw new Error('Drive kaputt');
      return ok;
    });
    expect(await syncPlanObjekteFromDrive(refs(['a', 'b', 'fehlt']))).toEqual([
      { art: 'risikoobjekt', id: 'a', error: 'Drive kaputt' },
      { art: 'risikoobjekt', id: 'b', result: ok },
      { art: 'risikoobjekt', id: 'fehlt', result: { status: 'keinDriveLink' } },
    ]);
  });

  it('nimmt nur kleine Blöcke und gültige IDs an', async () => {
    session.user.isAdmin = true;
    await expect(
      syncPlanObjekteFromDrive(refs(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])),
    ).rejects.toThrow();
    expect(await syncPlanObjekteFromDrive(refs(['../x']))).toEqual([
      { art: 'risikoobjekt', id: '../x', result: { status: 'keinDriveLink' } },
    ]);
    expect(driveSync.run).not.toHaveBeenCalled();
  });
});

describe('gefährdete Objekte', () => {
  const drive = 'https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N';

  it('weist eine unbekannte Objektart ab — sie würde Teil eines Pfads', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(
      await setRisikoObjektGroups('call' as 'risikoobjekt', 'g', ['a']),
    ).toEqual({ ok: false, error: 'notFound' });
    expect(
      await reindexObjektDokumentAction('../risikoobjekt' as 'risikoobjekt', 'g', 'd1'),
    ).toEqual({ ok: false, error: 'notFound' });
    expect(store.storageGroups).toHaveLength(0);
  });

  it('sucht das Objekt in der Collection seiner Art', async () => {
    store.objekte.set('g', gis('g', ['a']));
    expect(await setRisikoObjektGroups('gefahrobjekt', 'g', ['a'])).toEqual({
      ok: false,
      error: 'notFound',
    });
  });

  it('pflegt Freigabe und Link eines gefährdeten Objekts', async () => {
    session.user.groupRoles = { a: ['gruppenadmin'], b: ['gruppenadmin'] };
    store.gefahr.set('markt', gis('markt', ['a']));
    expect(await setRisikoObjektGroups('gefahrobjekt', 'markt', ['a', 'b'])).toEqual({
      ok: true,
      id: 'markt',
    });
    expect(store.gefahr.get('markt')?.groups).toEqual(['a', 'b']);
    expect(store.storageGroups).toEqual([{ art: 'gefahrobjekt', id: 'markt', groups: ['a', 'b'] }]);

    await updateRisikoObjekt('gefahrobjekt', 'markt', { ...input, name: 'Anders', link: drive });
    expect(store.gefahr.get('markt')).toMatchObject({ name: 'markt', link: drive });
    expect(store.objekte.size).toBe(0);
  });

  it('liest Pläne eines gefährdeten Objekts mit eigenem Schlüssel neu ein', async () => {
    store.gefahr.set('markt', gis('markt', ['a']));
    const plan = {
      id: 'd1',
      storagePath: 'gefahrobjekt/markt/d1-plan.pdf',
      contentType: 'application/pdf',
      indexStatus: 'ok',
    };
    store.dokumente.set('d1', plan);
    reindex.run.mockResolvedValue({ ...plan, melder: [] });
    expect(await reindexObjektDokumentAction('gefahrobjekt', 'markt', 'd1')).toMatchObject({ ok: true });
    expect(reindex.key).toBe('gefahrobjekt_markt_d1');
  });

  it('gibt auch gefährdete Objekte ohne Freigabe frei', async () => {
    session.user.isAdmin = true;
    store.objekte.set('r1', gis('r1'));
    store.gefahr.set('g1', gis('g1'));
    expect(await shareUnsharedRisikoObjekte(['a'])).toEqual({ ok: true, count: 2 });
    expect(store.gefahr.get('g1')?.groups).toEqual(['a']);
    expect(store.storageGroups).toContainEqual({ art: 'gefahrobjekt', id: 'g1', groups: ['a'] });
  });

  it('nimmt gefährdete Objekte in Neu-Einlesen und Drive-Abgleich auf', async () => {
    session.user.isAdmin = true;
    store.gefahr.set('markt', { ...gis('markt', ['a']), name: 'Markt', link: drive });
    store.dokumente.set('d9', {
      id: 'd9',
      storagePath: 'gefahrobjekt/markt/d9.pdf',
      contentType: 'application/pdf',
      indexStatus: 'ohneText',
    });
    expect(await listObjektDokumenteForReindex()).toEqual([
      expect.objectContaining({ art: 'gefahrobjekt', objektId: 'markt', dokumentId: 'd9' }),
    ]);
    expect(await listPlanObjekteWithDriveLink()).toEqual([
      { art: 'gefahrobjekt', id: 'markt', name: 'Markt' },
    ]);

    const ok = { status: 'ok', imported: 1, removed: 0, skipped: 0, failed: 0 } as const;
    driveSync.run.mockResolvedValue(ok);
    expect(await syncPlanObjekteFromDrive([{ art: 'gefahrobjekt', id: 'markt' }])).toEqual([
      { art: 'gefahrobjekt', id: 'markt', result: ok },
    ]);
    expect(driveSync.run).toHaveBeenCalledWith(
      { art: 'gefahrobjekt', id: 'markt' },
      drive,
      { marker: 'driveDeps' },
    );
  });
});
