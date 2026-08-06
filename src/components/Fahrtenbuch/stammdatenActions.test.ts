import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actionAdminRequiredMock = vi.fn();
vi.mock('../../app/auth', () => ({
  actionAdminRequired: () => actionAdminRequiredMock(),
}));

const { setMock, getMock, docMock, collectionMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  getMock: vi.fn(),
  docMock: vi.fn(),
  collectionMock: vi.fn(),
}));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => collectionMock(...args),
  },
}));

import {
  getFahrtenbuchMangelEmails,
  saveFahrtenbuchGroupStandort,
  saveFahrtenbuchMangelEmails,
} from './stammdatenActions';

const adminSession = { user: { id: 'admin1', isAdmin: true } };

describe('saveFahrtenbuchGroupStandort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionAdminRequiredMock.mockResolvedValue(adminSession);
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
