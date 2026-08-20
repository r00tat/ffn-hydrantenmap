import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  addMock,
  mangelDocGetMock,
  mangelDocSetMock,
  mangelDocDeleteMock,
  mangelQueryGetMock,
  vehicleGetMock,
  vehicleSetMock,
  entriesQueryGetMock,
  batchSetMock,
  batchCommitMock,
  actionUserRequiredMock,
  actionAdminRequiredMock,
  deleteMangelImagesMock,
  signMangelImagesMock,
} = vi.hoisted(() => ({
  deleteMangelImagesMock: vi.fn(),
  signMangelImagesMock: vi.fn(),
  addMock: vi.fn(),
  mangelDocGetMock: vi.fn(),
  mangelDocSetMock: vi.fn(),
  mangelDocDeleteMock: vi.fn(),
  mangelQueryGetMock: vi.fn(),
  vehicleGetMock: vi.fn(),
  vehicleSetMock: vi.fn(),
  entriesQueryGetMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  actionUserRequiredMock: vi.fn(),
  actionAdminRequiredMock: vi.fn(),
}));

vi.mock('../../app/auth', () => ({
  actionUserRequired: actionUserRequiredMock,
  actionAdminRequired: actionAdminRequiredMock,
}));

vi.mock('./mangelImageStore', () => ({
  deleteMangelImages: deleteMangelImagesMock,
  signMangelImages: signMangelImagesMock,
}));

// `FieldValue.delete()` als erkennbarer Marker — die Tests prüfen damit, dass
// `resolvedAt` beim Wiederöffnen wirklich gelöscht und nicht bloß überschrieben
// wird.
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => 'DELETE_FIELD' },
}));

vi.mock('../../server/firebase/admin', () => {
  const mangelDoc = {
    get: mangelDocGetMock,
    set: mangelDocSetMock,
    delete: mangelDocDeleteMock,
  };
  const mangelCollection = {
    add: addMock,
    doc: (id?: string) => (id === undefined ? { id: 'generated' } : mangelDoc),
    where: () => mangelCollection,
    orderBy: () => mangelCollection,
    get: mangelQueryGetMock,
  };
  const entriesCollection = {
    where: () => entriesCollection,
    orderBy: () => entriesCollection,
    limit: () => entriesCollection,
    get: entriesQueryGetMock,
  };
  const groupDoc = {
    collection: (name: string) => {
      if (name === 'vehicle') {
        return { doc: () => ({ get: vehicleGetMock, set: vehicleSetMock }) };
      }
      return name === 'mangel' ? mangelCollection : entriesCollection;
    },
  };
  return {
    firestore: {
      collection: () => ({ doc: () => groupDoc }),
      batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
    },
  };
});

import {
  addMangelNote,
  changeMangelStatus,
  createMangel,
  deleteMangel,
  mangelImageUrls,
  migrateDefectsToMangel,
  updateMangel,
} from './mangelActions';

const SESSION = {
  user: {
    id: 'u1',
    name: 'Max Mustermann',
    email: 'max@ffn.at',
    isAdmin: false,
    groups: ['ffnd'],
  },
};

const ADMIN_SESSION = {
  user: { ...SESSION.user, id: 'admin1', isAdmin: true },
};

const EXISTING = {
  vehicleId: 'v1',
  vehicleName: 'TLF',
  description: 'Blinker hinten links defekt',
  status: 'open',
  notes: [],
  reportedAt: '2026-08-01T08:00:00.000Z',
  reportedBy: 'u9',
  reportedByName: 'Bernd Beispiel',
  group: 'ffnd',
  createdAt: '2026-08-01T08:00:00.000Z',
  createdBy: 'u9',
  updatedAt: '2026-08-01T08:00:00.000Z',
  updatedBy: 'u9',
};

function mangelSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    id: 'm1',
    data: () => ({ ...EXISTING, ...overrides }),
  };
}

/** Die Mängel, die der Zähler für den Fahrzeug-Cache sieht. */
function openMangel(statuses: string[]) {
  return {
    docs: statuses.map((status, index) => ({
      id: `m${index}`,
      data: () => ({ ...EXISTING, status }),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  actionUserRequiredMock.mockResolvedValue(SESSION);
  actionAdminRequiredMock.mockResolvedValue(ADMIN_SESSION);
  vehicleGetMock.mockResolvedValue({
    exists: true,
    id: 'v1',
    data: () => ({ name: 'TLF', kennzeichen: 'N-1' }),
  });
  addMock.mockResolvedValue({ id: 'm1' });
  mangelDocGetMock.mockResolvedValue(mangelSnapshot());
  mangelQueryGetMock.mockResolvedValue(openMangel(['open']));
  entriesQueryGetMock.mockResolvedValue({ docs: [] });
  deleteMangelImagesMock.mockResolvedValue(undefined);
  signMangelImagesMock.mockResolvedValue([]);
});

describe('createMangel', () => {
  it('legt den Mangel mit dem Fahrzeugnamen aus dem Fahrzeugdokument an', async () => {
    const result = await createMangel('ffnd', {
      vehicleId: 'v1',
      description: '  Blinker defekt  ',
    });
    expect(result).toMatchObject({ success: true, id: 'm1' });

    const doc = addMock.mock.calls[0][0];
    expect(doc).toMatchObject({
      vehicleId: 'v1',
      vehicleName: 'TLF',
      description: 'Blinker defekt',
      status: 'open',
      group: 'ffnd',
      createdBy: 'u1',
      reportedByName: 'Max Mustermann',
    });
    expect(doc.notes).toEqual([]);
  });

  it('frischt den Mängel-Cache des Fahrzeugs auf', async () => {
    mangelQueryGetMock.mockResolvedValue(openMangel(['open', 'inProgress']));
    await createMangel('ffnd', { vehicleId: 'v1', description: 'x' });
    expect(vehicleSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ openMangelCount: 2 }),
      { merge: true },
    );
  });

  it('lehnt einen Mangel ohne Beschreibung ab', async () => {
    const result = await createMangel('ffnd', {
      vehicleId: 'v1',
      description: '   ',
    });
    expect(result.success).toBe(false);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('lehnt ein unbekanntes Fahrzeug ab', async () => {
    vehicleGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    const result = await createMangel('ffnd', {
      vehicleId: 'v9',
      description: 'x',
    });
    expect(result.success).toBe(false);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('lehnt ein Nicht-Mitglied ab', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { ...SESSION.user, groups: ['andere'] },
    });
    const result = await createMangel('ffnd', {
      vehicleId: 'v1',
      description: 'x',
    });
    expect(result).toEqual({ success: false, error: 'notInGroup' });
    expect(addMock).not.toHaveBeenCalled();
  });

  it('lehnt eine Pseudo-Gruppe ab', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { ...SESSION.user, groups: ['allUsers'] },
    });
    const result = await createMangel('allUsers', {
      vehicleId: 'v1',
      description: 'x',
    });
    expect(result).toEqual({ success: false, error: 'notInGroup' });
    expect(addMock).not.toHaveBeenCalled();
  });

  it('übernimmt die hochgeladenen Bilder', async () => {
    await createMangel('ffnd', {
      vehicleId: 'v1',
      description: 'x',
      images: ['groups/ffnd/mangel/u-1/foto.jpg'],
    });
    expect(addMock.mock.calls[0][0].images).toEqual([
      'groups/ffnd/mangel/u-1/foto.jpg',
    ]);
  });

  it('verwirft ein Bild aus einer fremden Gruppe', async () => {
    // Der Pfad kommt aus dem Browser. Ohne die Prüfung zeigte ein Mangel auf
    // Dateien einer fremden Gruppe — und die Anzeige signierte sie brav.
    await createMangel('ffnd', {
      vehicleId: 'v1',
      description: 'x',
      images: ['groups/andere/mangel/u-1/foto.jpg'],
    });
    expect(addMock.mock.calls[0][0]).not.toHaveProperty('images');
  });

  it('verwirft einen vom Client behaupteten Status', async () => {
    // Ein neu gemeldeter Mangel ist offen. Käme der Status aus der Eingabe
    // durch, ließe sich ein Mangel als bereits behoben anlegen.
    await createMangel('ffnd', {
      vehicleId: 'v1',
      description: 'x',
      status: 'resolved',
    } as never);
    expect(addMock.mock.calls[0][0].status).toBe('open');
  });
});

describe('changeMangelStatus', () => {
  it('setzt den Status und schreibt das Behebungsdatum', async () => {
    const result = await changeMangelStatus('ffnd', 'm1', 'resolved');
    expect(result.success).toBe(true);

    const patch = mangelDocSetMock.mock.calls[0][0];
    expect(patch.status).toBe('resolved');
    expect(typeof patch.resolvedAt).toBe('string');
    expect(patch.updatedBy).toBe('u1');
    expect(mangelDocSetMock.mock.calls[0][1]).toEqual({ merge: true });
  });

  it('übernimmt ein korrigiertes Behebungsdatum', async () => {
    await changeMangelStatus('ffnd', 'm1', 'resolved', {
      resolvedAt: '2026-08-03T12:00:00.000Z',
    });
    expect(mangelDocSetMock.mock.calls[0][0].resolvedAt).toBe(
      '2026-08-03T12:00:00.000Z',
    );
  });

  it('löscht das Behebungsdatum beim Wiederöffnen', async () => {
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({ status: 'resolved', resolvedAt: '2026-08-05T00:00:00.000Z' }),
    );
    await changeMangelStatus('ffnd', 'm1', 'inProgress');
    // Nicht `undefined`: bei `merge: true` bliebe das alte Datum stehen.
    expect(mangelDocSetMock.mock.calls[0][0].resolvedAt).toBe('DELETE_FIELD');
  });

  it('hängt den Statuswechsel an den Verlauf an', async () => {
    await changeMangelStatus('ffnd', 'm1', 'inProgress', {
      note: 'Werkstatttermin am 12.8.',
    });
    const notes = mangelDocSetMock.mock.calls[0][0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      text: 'Werkstatttermin am 12.8.',
      status: 'inProgress',
      by: 'u1',
      byName: 'Max Mustermann',
    });
  });

  it('frischt den Mängel-Cache des Fahrzeugs auf', async () => {
    mangelQueryGetMock.mockResolvedValue(openMangel(['resolved']));
    await changeMangelStatus('ffnd', 'm1', 'resolved');
    expect(vehicleSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ openMangelCount: 0 }),
      { merge: true },
    );
  });

  it('merkt sich den Mangel der letzten Fahrt auch nach dem Beheben', async () => {
    // #706: Ohne diesen Vermerk nahm das Beheben nur den Mängelzähler weg und
    // gab damit „Defekt gemeldet" frei — das Beheben machte den Hinweis nicht
    // weg, sondern erst sichtbar.
    entriesQueryGetMock.mockResolvedValue({
      docs: [
        {
          id: 'e1',
          data: () => ({
            abfahrt: '2026-08-01T08:00:00.000Z',
            driverName: 'Bernd Beispiel',
            defekt: true,
            counters: {},
          }),
        },
      ],
    });
    mangelQueryGetMock.mockResolvedValue({
      docs: [
        { id: 'm1', data: () => ({ ...EXISTING, status: 'resolved', entryId: 'e1' }) },
      ],
    });

    await changeMangelStatus('ffnd', 'm1', 'resolved');

    expect(vehicleSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        openMangelCount: 0,
        lastEntryHasDefect: true,
        lastEntryMangelId: 'm1',
      }),
      { merge: true },
    );
  });

  it('lehnt einen unbekannten Status ab', async () => {
    const result = await changeMangelStatus('ffnd', 'm1', 'erledigt' as never);
    expect(result.success).toBe(false);
    expect(mangelDocSetMock).not.toHaveBeenCalled();
  });

  it('lehnt einen Mangel aus einer fremden Gruppe ab', async () => {
    // Die Dokument-ID allein ist keine Berechtigung: Ohne diese Prüfung
    // schriebe ein Mitglied von Gruppe A an einem Mangel von Gruppe B, wenn
    // es dessen ID kennt und seine eigene Gruppe im Pfad mitschickt.
    mangelDocGetMock.mockResolvedValue(mangelSnapshot({ group: 'andere' }));
    const result = await changeMangelStatus('ffnd', 'm1', 'resolved');
    expect(result.success).toBe(false);
    expect(mangelDocSetMock).not.toHaveBeenCalled();
  });

  it('meldet einen nicht vorhandenen Mangel', async () => {
    mangelDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    const result = await changeMangelStatus('ffnd', 'm1', 'resolved');
    expect(result).toEqual({ success: false, error: 'mangelNotFound' });
  });
});

describe('addMangelNote', () => {
  it('hängt die Notiz mit Autor und Zeit an', async () => {
    const result = await addMangelNote('ffnd', 'm1', '  Ersatzteil bestellt  ');
    expect(result.success).toBe(true);

    const patch = mangelDocSetMock.mock.calls[0][0];
    expect(patch.notes).toHaveLength(1);
    expect(patch.notes[0]).toMatchObject({
      text: 'Ersatzteil bestellt',
      by: 'u1',
      byName: 'Max Mustermann',
    });
    // Eine Notiz ändert den Status nicht.
    expect(patch).not.toHaveProperty('status');
  });

  it('lehnt eine leere Notiz ab', async () => {
    const result = await addMangelNote('ffnd', 'm1', '   ');
    expect(result.success).toBe(false);
    expect(mangelDocSetMock).not.toHaveBeenCalled();
  });
});

describe('updateMangel', () => {
  it('korrigiert die Beschreibung, ohne den Verlauf anzutasten', async () => {
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({
        notes: [
          {
            text: 'alt',
            at: '2026-08-02T00:00:00.000Z',
            by: 'u9',
            byName: 'Bernd',
          },
        ],
      }),
    );
    const result = await updateMangel('ffnd', 'm1', {
      description: '  Blinker vorne rechts defekt  ',
    });
    expect(result.success).toBe(true);

    const patch = mangelDocSetMock.mock.calls[0][0];
    expect(patch.description).toBe('Blinker vorne rechts defekt');
    expect(patch).not.toHaveProperty('notes');
    expect(patch).not.toHaveProperty('status');
    expect(patch.updatedBy).toBe('u1');
  });

  it('lehnt eine leere Beschreibung ab', async () => {
    const result = await updateMangel('ffnd', 'm1', { description: '  ' });
    expect(result.success).toBe(false);
    expect(mangelDocSetMock).not.toHaveBeenCalled();
  });

  it('löscht die entfernten Bilder aus dem Storage', async () => {
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({
        images: ['groups/ffnd/mangel/m1/a.jpg', 'groups/ffnd/mangel/m1/b.jpg'],
      }),
    );
    const result = await updateMangel('ffnd', 'm1', {
      description: 'x',
      images: ['groups/ffnd/mangel/m1/b.jpg'],
    });
    expect(result.success).toBe(true);
    expect(mangelDocSetMock.mock.calls[0][0].images).toEqual([
      'groups/ffnd/mangel/m1/b.jpg',
    ]);
    expect(deleteMangelImagesMock).toHaveBeenCalledWith([
      'groups/ffnd/mangel/m1/a.jpg',
    ]);
  });

  it('lässt die Bilder unangetastet, wenn keine Liste mitkommt', async () => {
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({ images: ['groups/ffnd/mangel/m1/a.jpg'] }),
    );
    await updateMangel('ffnd', 'm1', { description: 'x' });
    expect(mangelDocSetMock.mock.calls[0][0]).not.toHaveProperty('images');
    expect(deleteMangelImagesMock).not.toHaveBeenCalled();
  });

  it('leert die Bilderliste, wenn alle entfernt wurden', async () => {
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({ images: ['groups/ffnd/mangel/m1/a.jpg'] }),
    );
    await updateMangel('ffnd', 'm1', { description: 'x', images: [] });
    expect(mangelDocSetMock.mock.calls[0][0].images).toEqual([]);
    expect(deleteMangelImagesMock).toHaveBeenCalledWith([
      'groups/ffnd/mangel/m1/a.jpg',
    ]);
  });
});

describe('mangelImageUrls', () => {
  it('signiert die Bilder des Mangels', async () => {
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({ images: ['groups/ffnd/mangel/m1/a.jpg'] }),
    );
    signMangelImagesMock.mockResolvedValue(['https://signed/a']);

    const result = await mangelImageUrls('ffnd', 'm1');
    expect(result).toEqual({
      success: true,
      images: [
        { path: 'groups/ffnd/mangel/m1/a.jpg', url: 'https://signed/a' },
      ],
    });
    expect(signMangelImagesMock).toHaveBeenCalledWith([
      'groups/ffnd/mangel/m1/a.jpg',
    ]);
  });

  it('signiert nichts für ein Nicht-Mitglied', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { ...SESSION.user, groups: ['andere'] },
    });
    const result = await mangelImageUrls('ffnd', 'm1');
    expect(result).toEqual({ success: false, error: 'notInGroup' });
    expect(signMangelImagesMock).not.toHaveBeenCalled();
  });

  it('signiert keinen Pfad aus einer fremden Gruppe', async () => {
    // Ein manipuliertes Dokument darf die Signatur nicht auf fremde Dateien
    // lenken — die Prüfung gilt beim Lesen genauso wie beim Schreiben.
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({ images: ['groups/andere/mangel/m1/a.jpg'] }),
    );
    const result = await mangelImageUrls('ffnd', 'm1');
    expect(result.success).toBe(true);
    expect(signMangelImagesMock).toHaveBeenCalledWith([]);
  });
});

describe('deleteMangel', () => {
  it('löscht nur für Admins', async () => {
    const result = await deleteMangel('ffnd', 'm1');
    expect(result.success).toBe(false);
    expect(mangelDocDeleteMock).not.toHaveBeenCalled();
  });

  it('löscht für einen Admin und frischt den Cache auf', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { ...SESSION.user, isAdmin: true },
    });
    mangelQueryGetMock.mockResolvedValue(openMangel([]));
    const result = await deleteMangel('ffnd', 'm1');
    expect(result.success).toBe(true);
    expect(mangelDocDeleteMock).toHaveBeenCalled();
    expect(vehicleSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ openMangelCount: 0 }),
      { merge: true },
    );
  });

  it('räumt die Bilder aus dem Storage mit weg', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { ...SESSION.user, isAdmin: true },
    });
    mangelDocGetMock.mockResolvedValue(
      mangelSnapshot({ images: ['groups/ffnd/mangel/m1/a.jpg'] }),
    );
    await deleteMangel('ffnd', 'm1');
    expect(deleteMangelImagesMock).toHaveBeenCalledWith([
      'groups/ffnd/mangel/m1/a.jpg',
    ]);
  });
});

describe('migrateDefectsToMangel', () => {
  const defectEntry = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    data: () => ({
      vehicleId: 'v1',
      vehicleName: 'TLF',
      driverName: 'Bernd Beispiel',
      abfahrt: '2026-07-01T06:00:00.000Z',
      defekt: true,
      mangel: 'Blinker defekt',
      deleted: false,
      ...overrides,
    }),
  });

  it('übernimmt jede Fahrt mit Defekt als offenen Mangel', async () => {
    entriesQueryGetMock.mockResolvedValue({ docs: [defectEntry('e1')] });
    mangelQueryGetMock.mockResolvedValue({ docs: [] });

    const result = await migrateDefectsToMangel('ffnd');
    expect(result).toMatchObject({ success: true, created: 1, skipped: 0 });

    const doc = batchSetMock.mock.calls[0][1];
    expect(doc).toMatchObject({
      vehicleId: 'v1',
      entryId: 'e1',
      description: 'Blinker defekt',
      status: 'open',
      // Der Mangel ist so alt wie die Fahrt, nicht so alt wie die Migration.
      reportedAt: '2026-07-01T06:00:00.000Z',
      reportedByName: 'Bernd Beispiel',
      group: 'ffnd',
    });
    expect(batchCommitMock).toHaveBeenCalled();
  });

  it('ist idempotent — ein zweiter Lauf erzeugt keine Duplikate', async () => {
    entriesQueryGetMock.mockResolvedValue({ docs: [defectEntry('e1')] });
    mangelQueryGetMock.mockResolvedValue({
      docs: [{ id: 'm1', data: () => ({ ...EXISTING, entryId: 'e1' }) }],
    });

    const result = await migrateDefectsToMangel('ffnd');
    expect(result).toMatchObject({ success: true, created: 0, skipped: 1 });
    expect(batchSetMock).not.toHaveBeenCalled();
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('fällt auf die Hinweise zurück, wenn kein Mangeltext da ist', async () => {
    // Einträge aus der Zeit vor dem eigenen Mangelfeld tragen nur das Häkchen.
    entriesQueryGetMock.mockResolvedValue({
      docs: [
        defectEntry('e1', {
          mangel: undefined,
          hinweise: 'Bremse quietscht',
        }),
      ],
    });
    mangelQueryGetMock.mockResolvedValue({ docs: [] });

    await migrateDefectsToMangel('ffnd');
    expect(batchSetMock.mock.calls[0][1].description).toBe('Bremse quietscht');
  });

  it('übernimmt auch eine Fahrt ganz ohne Text', async () => {
    // Ohne Rückfall fiele der Mangel aus der Übernahme heraus, obwohl die
    // Fahrt einen Defekt meldet — das Häkchen ist die Aussage.
    entriesQueryGetMock.mockResolvedValue({
      docs: [defectEntry('e1', { mangel: undefined, hinweise: undefined })],
    });
    mangelQueryGetMock.mockResolvedValue({ docs: [] });

    const result = await migrateDefectsToMangel('ffnd');
    expect(result.created).toBe(1);
    expect(batchSetMock.mock.calls[0][1].description).toBeTruthy();
  });

  it('verlangt Admin-Rechte', async () => {
    actionAdminRequiredMock.mockRejectedValue(new Error('admin required'));
    const result = await migrateDefectsToMangel('ffnd');
    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });
});
