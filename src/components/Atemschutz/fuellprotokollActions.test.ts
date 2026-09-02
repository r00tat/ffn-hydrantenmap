import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CsvFuellung } from '../../common/fuellprotokollCsv';

vi.mock('server-only', () => ({}));

const groupAdminMock = vi.fn();
const memberMock = vi.fn();

vi.mock('../../app/auth', () => ({
  actionGroupAdminRequired: (groupId: string) => groupAdminMock(groupId),
}));

vi.mock('../Fahrtenbuch/authGuards', () => ({
  actionGroupMemberRequired: (groupId: string) => memberMock(groupId),
}));

vi.mock('../firebase/firestore', () => ({ GROUP_COLLECTION_ID: 'groups' }));

vi.mock('./atemschutzStammdaten', () => ({ loadGeraete: async () => [] }));

vi.mock('./renderFuellprotokollPdf', () => ({
  renderFuellprotokollPdf: async () => new Uint8Array([1, 2, 3]),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

/** Der Bestand, gegen den der Dublettenabgleich läuft. */
const bestand: Record<string, unknown>[] = [];
const docMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const batchSetMock = vi.fn();
const batchCommitMock = vi.fn();

/** Eine Abfragekette, die jede `where`/`orderBy`/`limit` durchreicht. */
function query() {
  const kette = {
    where: () => kette,
    orderBy: () => kette,
    limit: () => kette,
    get: async () => ({ docs: bestand.map((data) => ({ data: () => data })) }),
  };
  return kette;
}

vi.mock('./rechnungStore', () => ({
  fuellungRef: () => ({ ...query(), doc: docMock }),
}));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: () => ({
      doc: () => ({ get: async () => ({ data: () => ({ name: 'FF NSee' }) }) }),
    }),
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
  },
}));

import {
  deleteFremdeFuellung,
  importFuellungen,
  previewFuellungImport,
  updateFremdeFuellung,
  type FuellungImportZeile,
} from './fuellprotokollActions';

function csv(over: Partial<CsvFuellung> = {}): CsvFuellung {
  return {
    zeitpunkt: '2026-08-29T10:00:00.000Z',
    flaschenNummer: '2.16.19',
    feuerwehr: 'Neusiedl am See',
    anzahl: 1,
    enddruck: 300,
    gefuelltVon: 'Paul',
    zweck: 'sonstiges',
    verrechnen: false,
    ...over,
  };
}

function zeile(fuellung: CsvFuellung, nummer = 2): FuellungImportZeile {
  return { zeile: nummer, fuellung, status: 'new' };
}

beforeEach(() => {
  vi.clearAllMocks();
  bestand.length = 0;
  groupAdminMock.mockResolvedValue({ user: { id: 'u1' } });
  memberMock.mockResolvedValue({ user: { id: 'u1', name: 'Paul' } });
});

describe('previewFuellungImport', () => {
  it('erkennt eine Zeile, die schon im Bestand steht', async () => {
    bestand.push({
      flaschenNummer: '2-16-19',
      feuerwehr: 'Neusiedl am See',
      zeitpunkt: '2026-08-29T10:00:45.000Z',
    });

    const result = await previewFuellungImport('ffnd', [zeile(csv())]);
    expect(result.success).toBe(true);
    expect(result.plan?.[0].status).toBe('duplicate');
  });

  it('erkennt eine Dublette innerhalb der Datei', async () => {
    const result = await previewFuellungImport('ffnd', [
      zeile(csv(), 2),
      zeile(csv(), 3),
    ]);
    expect(result.plan?.map((z) => z.status)).toEqual(['new', 'duplicate']);
  });

  it('lässt eine andere Flasche in derselben Minute durch', async () => {
    bestand.push({
      flaschenNummer: '2.16.19',
      feuerwehr: 'Neusiedl am See',
      zeitpunkt: '2026-08-29T10:00:00.000Z',
    });

    const result = await previewFuellungImport('ffnd', [
      zeile(csv({ flaschenNummer: '2.16.20' })),
    ]);
    expect(result.plan?.[0].status).toBe('new');
  });

  it('verlangt die Gruppen-Admin-Rolle', async () => {
    groupAdminMock.mockRejectedValue(new Error('user may not administer group'));
    const result = await previewFuellungImport('ffnd', [zeile(csv())]);
    expect(result).toEqual({ success: false, error: 'notGroupAdmin' });
  });

  it('lehnt eine leere Liste ab', async () => {
    expect(await previewFuellungImport('ffnd', [])).toEqual({
      success: false,
      error: 'fileEmpty',
    });
  });
});

describe('importFuellungen', () => {
  it('schreibt nur die neuen Zeilen und zählt die übersprungenen', async () => {
    bestand.push({
      flaschenNummer: '2.16.19',
      feuerwehr: 'Neusiedl am See',
      zeitpunkt: '2026-08-29T10:00:00.000Z',
    });
    docMock.mockReturnValue({ id: 'neu' });

    const result = await importFuellungen('ffnd', [
      zeile(csv(), 2),
      zeile(csv({ flaschenNummer: '2.16.20' }), 3),
    ]);

    expect(result).toMatchObject({ success: true, created: 1, skipped: 1 });
    expect(batchSetMock).toHaveBeenCalledTimes(1);
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('prüft den Bestand erneut, auch wenn der Client „neu" behauptet', async () => {
    // Zwischen Vorschau und Import kann jemand dieselbe Datei eingespielt
    // haben — und der Status kommt ohnehin vom Client.
    bestand.push({
      flaschenNummer: '2.16.19',
      feuerwehr: 'Neusiedl am See',
      zeitpunkt: '2026-08-29T10:00:00.000Z',
    });

    const result = await importFuellungen('ffnd', [zeile(csv())]);
    expect(result).toMatchObject({ created: 0, skipped: 1 });
    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('legt keinen Einsatzbezug an, behält aber den Namen', async () => {
    docMock.mockReturnValue({ id: 'neu' });
    await importFuellungen('ffnd', [
      zeile(csv({ firecallName: 'Brand K1', zweck: 'einsatz' })),
    ]);

    const geschrieben = batchSetMock.mock.calls[0][1];
    // Eine geratene Einsatz-ID wäre schlimmer als keine.
    expect(geschrieben.firecallId).toBe('');
    expect(geschrieben.firecallName).toBe('Brand K1');
    expect(geschrieben.zweck).toBe('einsatz');
    expect(geschrieben.createdBy).toBe('u1');
  });
});

describe('updateFremdeFuellung', () => {
  function doc(data: Record<string, unknown> | undefined) {
    docMock.mockReturnValue({
      get: async () => ({ exists: !!data, data: () => data }),
      update: updateMock,
      delete: deleteMock,
    });
  }

  it('schreibt nur die erlaubten Felder und stempelt den Bearbeiter', async () => {
    doc({ createdBy: 'jemand-anderes' });

    const result = await updateFremdeFuellung('ffnd', 'f1', {
      enddruck: 200,
      // Nicht in der Liste erlaubter Felder — darf nicht durchkommen.
      createdBy: 'u1',
    } as never);

    expect(result.success).toBe(true);
    const patch = updateMock.mock.calls[0][0];
    expect(patch.enddruck).toBe(200);
    expect(patch.createdBy).toBeUndefined();
    expect(patch.updatedBy).toBe('u1');
  });

  it('lehnt eine bereits verrechnete Zeile ab — auch für den Gruppen-Admin', async () => {
    doc({ createdBy: 'jemand-anderes', rechnungId: 'r1' });

    expect(await updateFremdeFuellung('ffnd', 'f1', { enddruck: 200 })).toEqual({
      success: false,
      error: 'fuellungVerrechnet',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('meldet eine verschwundene Zeile', async () => {
    doc(undefined);
    expect(await updateFremdeFuellung('ffnd', 'f1', { enddruck: 200 })).toEqual({
      success: false,
      error: 'fuellungGone',
    });
  });

  it('löscht eine fremde Zeile, aber keine verrechnete', async () => {
    doc({ createdBy: 'jemand-anderes' });
    expect(await deleteFremdeFuellung('ffnd', 'f1')).toEqual({ success: true });
    expect(deleteMock).toHaveBeenCalled();

    deleteMock.mockClear();
    doc({ createdBy: 'jemand-anderes', rechnungId: 'r1' });
    expect(await deleteFremdeFuellung('ffnd', 'f1')).toEqual({
      success: false,
      error: 'fuellungVerrechnet',
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
