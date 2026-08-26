import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actionAdminRequiredMock = vi.fn();
// `actionFahrtenbuchManagerRequired` läuft hier echt und ruft `actionUserRequired`.
const actionUserRequiredMock = vi.fn();
vi.mock('../../app/auth', () => ({
  actionAdminRequired: () => actionAdminRequiredMock(),
  actionUserRequired: () => actionUserRequiredMock(),
}));

const {
  setMock,
  getMock,
  docMock,
  collectionMock,
  batchSetMock,
  batchCommitMock,
  listUsersMock,
} = vi.hoisted(() => ({
  setMock: vi.fn(),
  getMock: vi.fn(),
  docMock: vi.fn(),
  collectionMock: vi.fn(),
  batchSetMock: vi.fn(),
  batchCommitMock: vi.fn(),
  listUsersMock: vi.fn(),
}));

vi.mock('../../app/api/users/listUsers', () => ({
  listUsers: () => listUsersMock(),
}));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => collectionMock(...args),
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
  },
}));

import {
  getFahrtenbuchMangelEmails,
  proposePersonUserLinks,
  savePersonUserLinks,
  saveFahrtenbuchGroupStandort,
  saveFahrtenbuchMangelEmails,
  saveFahrtenbuchPerson,
} from './stammdatenActions';

const adminSession = { user: { id: 'admin1', isAdmin: true } };

describe('saveFahrtenbuchGroupStandort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionAdminRequiredMock.mockResolvedValue(adminSession);
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'admin1', isAdmin: true, groups: ['allUsers'] },
    });
    setMock.mockResolvedValue(undefined);
    docMock.mockReturnValue({ set: setMock });
    collectionMock.mockReturnValue({ doc: docMock });
  });

  it('gibt einen Fehler zurück, statt zu werfen, wenn der Admin-Guard scheitert', async () => {
    actionAdminRequiredMock.mockRejectedValueOnce(new Error('kein Admin'));

    const result = await saveFahrtenbuchGroupStandort('ffnd', {
      lat: 47.94,
      lng: 16.84,
    });

    expect(result).toEqual({ success: false, error: 'kein Admin' });
    expect(setMock).not.toHaveBeenCalled();
  });

  it('lehnt eine Nicht-Mandanten-Gruppe ab', async () => {
    const result = await saveFahrtenbuchGroupStandort('kostenersatz', {
      lat: 47.94,
      lng: 16.84,
    });

    expect(result.success).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('lehnt einen übergebenen, aber ungültigen Standort ab und schreibt nicht', async () => {
    const result = await saveFahrtenbuchGroupStandort('ffnd', {
      lat: 91,
      lng: 16.84,
    });

    expect(result).toEqual({ success: false, error: 'standortInvalid' });
    expect(setMock).not.toHaveBeenCalled();
  });

  it('schreibt null (Zurücksetzen), wenn kein Standort übergeben wird, ohne Fehler', async () => {
    const result = await saveFahrtenbuchGroupStandort('ffnd', undefined);

    expect(result).toEqual({ success: true, id: 'ffnd' });
    expect(setMock).toHaveBeenCalledTimes(1);
    const [payload] = setMock.mock.calls[0];
    expect(payload.standort).toBeNull();
  });

  it('schreibt mit merge: true, damit Name und Beschreibung erhalten bleiben', async () => {
    await saveFahrtenbuchGroupStandort('ffnd', { lat: 47.94, lng: 16.84 });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ standort: { lat: 47.94, lng: 16.84 } }),
      { merge: true },
    );
  });
});

describe('Mangel-Empfänger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionAdminRequiredMock.mockResolvedValue(adminSession);
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'admin1', isAdmin: true, groups: ['allUsers'] },
    });
    setMock.mockResolvedValue(undefined);
    getMock.mockResolvedValue({ exists: false });
    docMock.mockReturnValue({ set: setMock, get: getMock });
    collectionMock.mockReturnValue({ doc: docMock });
  });

  it('liest die gepflegten Empfänger aus der Konfiguration', async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ mangelEmails: ['zeugwart@example.at'] }),
    });

    await expect(getFahrtenbuchMangelEmails('ffnd')).resolves.toEqual({
      success: true,
      emails: ['zeugwart@example.at'],
    });
    expect(collectionMock).toHaveBeenCalledWith('fahrtenbuchConfig');
    expect(docMock).toHaveBeenCalledWith('ffnd');
  });

  it('liefert eine leere Liste, wenn nichts gepflegt ist', async () => {
    await expect(getFahrtenbuchMangelEmails('ffnd')).resolves.toEqual({
      success: true,
      emails: [],
    });
  });

  it('zeigt auch eine ungültige gespeicherte Adresse, damit sie korrigierbar bleibt', async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ mangelEmails: ['kein-mail', 42] }),
    });

    await expect(getFahrtenbuchMangelEmails('ffnd')).resolves.toEqual({
      success: true,
      emails: ['kein-mail'],
    });
  });

  it('gibt beim Lesen einen Fehler zurück, statt zu werfen', async () => {
    actionAdminRequiredMock.mockRejectedValueOnce(new Error('kein Admin'));

    const result = await getFahrtenbuchMangelEmails('ffnd');

    expect(result).toEqual({ success: false, emails: [], error: 'kein Admin' });
  });

  it('lehnt das Lesen für eine Nicht-Mandanten-Gruppe ab', async () => {
    const result = await getFahrtenbuchMangelEmails('kostenersatz');

    expect(result.success).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('speichert die Empfänger mit merge: true', async () => {
    const result = await saveFahrtenbuchMangelEmails('ffnd', [
      ' zeugwart@example.at ',
      'kommandant@example.at',
    ]);

    expect(result).toEqual({ success: true, id: 'ffnd' });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'ffnd',
        mangelEmails: ['zeugwart@example.at', 'kommandant@example.at'],
        updatedBy: 'admin1',
      }),
      { merge: true },
    );
  });

  it('speichert die leere Liste als Abschaltung', async () => {
    const result = await saveFahrtenbuchMangelEmails('ffnd', []);

    expect(result).toEqual({ success: true, id: 'ffnd' });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ mangelEmails: [] }),
      { merge: true },
    );
  });

  it('lehnt eine ungültige Adresse ab und schreibt nicht', async () => {
    const result = await saveFahrtenbuchMangelEmails('ffnd', ['kein-mail']);

    expect(result).toEqual({ success: false, error: 'emailInvalid' });
    expect(setMock).not.toHaveBeenCalled();
  });

  it('lehnt eine Nicht-Mandanten-Gruppe ab und schreibt nicht', async () => {
    const result = await saveFahrtenbuchMangelEmails('allUsers', [
      'zeugwart@example.at',
    ]);

    expect(result.success).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('schreibt nicht, wenn der Admin-Guard scheitert', async () => {
    actionAdminRequiredMock.mockRejectedValueOnce(new Error('kein Admin'));

    const result = await saveFahrtenbuchMangelEmails('ffnd', [
      'zeugwart@example.at',
    ]);

    expect(result).toEqual({ success: false, error: 'kein Admin' });
    expect(setMock).not.toHaveBeenCalled();
  });
});

describe('Gerätemeister-Zugriff auf die Stammdaten', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMock.mockResolvedValue(undefined);
    docMock.mockReturnValue({
      set: setMock,
      get: getMock,
      collection: collectionMock,
    });
    collectionMock.mockReturnValue({ doc: docMock });
  });

  it('lässt einen Gerätemeister eine Person speichern', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g1',
        isAdmin: false,
        groups: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      },
    });

    const result = await saveFahrtenbuchPerson('ffnd', 'p1', {
      name: 'Mustermann Max',
      active: true,
    });

    expect(result).toEqual({ success: true, id: 'p1' });
    expect(setMock).toHaveBeenCalled();
  });

  it('weist ein einfaches Gruppenmitglied ab', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'u1', isAdmin: false, groups: ['ffnd'] },
    });

    const result = await saveFahrtenbuchPerson('ffnd', 'p1', {
      name: 'Mustermann Max',
      active: true,
    });

    expect(result.success).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('weist den Gerätemeister einer anderen Gruppe ab', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g2',
        isAdmin: false,
        groups: ['ffnd', 'ffxy'],
        fahrtenbuchGeraetemeister: ['ffxy'],
      },
    });

    const result = await saveFahrtenbuchPerson('ffnd', 'p1', {
      name: 'Mustermann Max',
      active: true,
    });

    expect(result.success).toBe(false);
    expect(setMock).not.toHaveBeenCalled();
  });

  it('lässt den Gerätemeister nicht an die Mangel-Empfänger', async () => {
    // Die Einstellungen bleiben admin-only — sonst könnte sich ein
    // Gerätemeister selbst aus der Benachrichtigung nehmen.
    actionAdminRequiredMock.mockRejectedValue(new Error('kein Admin'));
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g1',
        isAdmin: false,
        groups: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      },
    });

    const result = await saveFahrtenbuchMangelEmails('ffnd', ['a@b.c']);

    expect(result.success).toBe(false);
  });
});


describe('proposePersonUserLinks', () => {
  /** `groups/<id>/person` → get(); dieselbe Kette wie `personsRef`. */
  function personCollection(
    persons: { id: string; data: Record<string, unknown> }[],
  ) {
    getMock.mockResolvedValue({
      docs: persons.map((p) => ({ id: p.id, data: () => p.data })),
    });
    docMock.mockReturnValue({
      collection: () => ({ get: getMock, doc: docMock }),
      set: setMock,
    });
    collectionMock.mockReturnValue({ doc: docMock });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    actionAdminRequiredMock.mockResolvedValue(adminSession);
    actionUserRequiredMock.mockResolvedValue(adminSession);
    batchCommitMock.mockResolvedValue(undefined);
  });

  it('weist ab, wer die Gruppe nicht verwalten darf', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'u1', isAdmin: false, groups: ['ffnd'] },
    });
    personCollection([]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.success).toBe(false);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('zeigt dem Gerätemeister nur Konten seiner Gruppe', async () => {
    // Er darf zuordnen, aber die Konten anderer Feuerwehren sind nicht seine
    // Sache — die Personen seiner Gruppe kennt er ohnehin namentlich.
    actionAdminRequiredMock.mockRejectedValue(new Error('kein Admin'));
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g1',
        isAdmin: false,
        groups: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      },
    });
    personCollection([
      { id: 'p1', data: { name: 'Adrian Schennet' } },
      { id: 'p2', data: { name: 'Fremde Person' } },
    ]);
    listUsersMock.mockResolvedValue([
      { uid: 'u1', displayName: 'Adrian Schennet', groups: ['ffnd'] },
      { uid: 'u2', displayName: 'Fremde Person', groups: ['H8VtNNVK1XXlTHrPLhXp'] },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.success).toBe(true);
    const own = result.matches?.find((m) => m.personId === 'p1');
    const foreign = result.matches?.find((m) => m.personId === 'p2');
    expect(own?.candidates.map((c) => c.uid)).toEqual(['u1']);
    expect(foreign?.status).toBe('none');
  });

  it('zeigt dem Admin auch ein Konto außerhalb der Gruppe', async () => {
    // Nur er kann die Gruppenzugehörigkeit überhaupt richtigstellen.
    personCollection([{ id: 'p1', data: { name: 'Adrian Schennet' } }]);
    listUsersMock.mockResolvedValue([
      { uid: 'u1', displayName: 'Adrian Schennet', groups: ['andere'] },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.matches?.[0].candidates.map((c) => c.uid)).toEqual(['u1']);
    expect(result.matches?.[0].candidates[0]?.inGroup).toBe(false);
  });

  it('lehnt eine Nicht-Mandanten-Gruppe ab', async () => {
    personCollection([]);

    const result = await proposePersonUserLinks('allUsers');

    expect(result.success).toBe(false);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('schlägt den eindeutigen Namenstreffer vor', async () => {
    personCollection([{ id: 'p1', data: { name: 'Adrian Schennet' } }]);
    listUsersMock.mockResolvedValue([
      { uid: 'u1', displayName: 'Adrian Schennet', email: 'a@ff.at' },
      { uid: 'u2', displayName: 'Paul Wölfel' },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches?.[0]).toMatchObject({
      personId: 'p1',
      status: 'unique',
    });
  });

  it('liest die Freischaltung aus `authorized` am Benutzerdokument', async () => {
    // Das Benutzerdokument speichert `authorized`, nicht `isAuthorized` —
    // vorher stand deshalb an jedem Konto „nicht freigeschaltet".
    personCollection([{ id: 'p1', data: { name: 'Adrian Schennet' } }]);
    listUsersMock.mockResolvedValue([
      { uid: 'u1', displayName: 'Adrian Schennet', authorized: true },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.matches?.[0].candidates[0]?.isAuthorized).toBe(true);
  });

  it('versteht auch ein `authorized` als Zeichenkette', async () => {
    // Ältere Dokumente tragen „true" als Text — `isTruthy` deckt beides ab,
    // wie schon in `auth.ts`.
    personCollection([{ id: 'p1', data: { name: 'Adrian Schennet' } }]);
    listUsersMock.mockResolvedValue([
      { uid: 'u1', displayName: 'Adrian Schennet', authorized: 'true' },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.matches?.[0].candidates[0]?.isAuthorized).toBe(true);
  });

  it('meldet ein nicht freigeschaltetes Konto als solches', async () => {
    personCollection([{ id: 'p1', data: { name: 'Adrian Schennet' } }]);
    listUsersMock.mockResolvedValue([
      { uid: 'u1', displayName: 'Adrian Schennet' },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.matches?.[0].candidates[0]?.isAuthorized).toBe(false);
  });

  it('gibt vom Benutzerkonto nur heraus, was der Dialog braucht', async () => {
    personCollection([{ id: 'p1', data: { name: 'Adrian Schennet' } }]);
    listUsersMock.mockResolvedValue([
      {
        uid: 'u1',
        displayName: 'Adrian Schennet',
        email: 'a@ff.at',
        disabled: false,
        authorized: true,
        groups: ['ffnd'],
        // Nichts davon darf beim Client landen.
        messagingTokens: ['token'],
        phone: '+43 660 1234567',
        photoURL: 'https://example.at/a.png',
      },
    ]);

    const result = await proposePersonUserLinks('ffnd');

    expect(result.matches?.[0].candidates[0]).toEqual({
      uid: 'u1',
      displayName: 'Adrian Schennet',
      email: 'a@ff.at',
      disabled: false,
      isAuthorized: true,
      inGroup: true,
    });
  });
});

describe('savePersonUserLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionAdminRequiredMock.mockResolvedValue(adminSession);
    actionUserRequiredMock.mockResolvedValue(adminSession);
    batchCommitMock.mockResolvedValue(undefined);
    docMock.mockReturnValue({
      collection: () => ({ get: getMock, doc: docMock }),
      set: setMock,
    });
    collectionMock.mockReturnValue({ doc: docMock });
    getMock.mockResolvedValue({ docs: [] });
    listUsersMock.mockResolvedValue([{ uid: 'u1' }, { uid: 'u2' }]);
  });

  it('weist ab, wer die Gruppe nicht verwalten darf', async () => {
    actionUserRequiredMock.mockResolvedValue({
      user: { id: 'u1', isAdmin: false, groups: ['ffnd'] },
    });

    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1'] },
    ]);

    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('lässt den Gerätemeister ein Konto seiner Gruppe zuordnen', async () => {
    actionAdminRequiredMock.mockRejectedValue(new Error('kein Admin'));
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g1',
        isAdmin: false,
        groups: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      },
    });
    listUsersMock.mockResolvedValue([
      { uid: 'u1', groups: ['ffnd'] },
      { uid: 'u2', groups: ['andere'] },
    ]);

    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1'] },
    ]);

    expect(result.success).toBe(true);
  });

  it('weist dem Gerätemeister ein gruppenfremdes Konto ab', async () => {
    // Der Filter im Vorschlag allein genügt nicht — die Nutzlast kommt vom
    // Client und kann jede Kennung nennen.
    actionAdminRequiredMock.mockRejectedValue(new Error('kein Admin'));
    actionUserRequiredMock.mockResolvedValue({
      user: {
        id: 'g1',
        isAdmin: false,
        groups: ['ffnd'],
        fahrtenbuchGeraetemeister: ['ffnd'],
      },
    });
    listUsersMock.mockResolvedValue([
      { uid: 'u1', groups: ['ffnd'] },
      { uid: 'u2', groups: ['andere'] },
    ]);

    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u2'] },
    ]);

    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('schreibt die bestätigten Zuordnungen', async () => {
    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1', 'u2'] },
    ]);

    expect(result.success).toBe(true);
    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userIds: ['u1', 'u2'],
        updatedBy: 'admin1',
      }),
      { merge: true },
    );
    expect(batchCommitMock).toHaveBeenCalled();
  });

  it('löst eine Verknüpfung mit leerer Liste', async () => {
    // Gesetzt und nicht ergänzt — sonst ließe sich eine falsche Zuordnung im
    // Dialog nie wieder wegnehmen.
    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: [] },
    ]);

    expect(result.success).toBe(true);
    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userIds: [] }),
      { merge: true },
    );
  });

  it('weist eine unbekannte Benutzerkennung ab', async () => {
    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u9'] },
    ]);

    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('weist dasselbe Konto an zwei Personen ab', async () => {
    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1'] },
      { personId: 'p2', userIds: ['u1'] },
    ]);

    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('entdoppelt eine mehrfach genannte Kennung', async () => {
    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1', 'u1'] },
    ]);

    expect(result.success).toBe(true);
    expect(batchSetMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userIds: ['u1'] }),
      { merge: true },
    );
  });

  it('lehnt eine Nicht-Mandanten-Gruppe ab', async () => {
    const result = await savePersonUserLinks('allUsers', [
      { personId: 'p1', userIds: ['u1'] },
    ]);

    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('weist ein Konto ab, das einer nicht mitgeschickten Person gehört', async () => {
    // Die Prüfung über die mitgeschickten Zeilen allein genügt nicht: Die
    // andere Person steht nicht im Aufruf und behielte das Konto trotzdem.
    getMock.mockResolvedValue({
      docs: [
        { id: 'p2', data: () => ({ name: 'Andere', userIds: ['u1'] }) },
      ],
    });

    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1'] },
    ]);

    expect(result.success).toBe(false);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('lässt eine Person ihr eigenes Konto behalten', async () => {
    getMock.mockResolvedValue({
      docs: [{ id: 'p1', data: () => ({ name: 'Eigen', userIds: ['u1'] }) }],
    });

    const result = await savePersonUserLinks('ffnd', [
      { personId: 'p1', userIds: ['u1', 'u2'] },
    ]);

    expect(result.success).toBe(true);
  });
});
