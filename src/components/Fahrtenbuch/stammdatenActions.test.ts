import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actionAdminRequiredMock = vi.fn();
vi.mock('../../app/auth', () => ({
  actionAdminRequired: () => actionAdminRequiredMock(),
}));

const { setMock, docMock, collectionMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  docMock: vi.fn(),
  collectionMock: vi.fn(),
}));

vi.mock('../../server/firebase/admin', () => ({
  firestore: {
    collection: (...args: unknown[]) => collectionMock(...args),
  },
}));

import { saveFahrtenbuchGroupStandort } from './stammdatenActions';

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
