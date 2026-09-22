import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getMock, createCustomTokenMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  createCustomTokenMock: vi.fn(),
}));

vi.mock('../firebase/admin', () => ({
  firebaseAuth: { createCustomToken: createCustomTokenMock },
  firestore: {
    collection: () => ({ doc: () => ({ get: getMock }) }),
  },
}));

import { mintFirebaseCustomToken } from './mintCustomToken';

function userDoc(data: Record<string, unknown> | undefined) {
  return { exists: data !== undefined, data: () => data };
}

describe('mintFirebaseCustomToken', () => {
  beforeEach(() => {
    getMock.mockReset();
    createCustomTokenMock.mockReset().mockResolvedValue('minted-token');
  });

  it('prägt die Claims aus dem Benutzerdokument, nicht aus dem Aufrufer', async () => {
    getMock.mockResolvedValue(
      userDoc({ authorized: true, isAdmin: true, groups: ['feuerwehr'] }),
    );

    const result = await mintFirebaseCustomToken('uid-1');

    expect(result).toEqual({ token: 'minted-token' });
    expect(createCustomTokenMock).toHaveBeenCalledWith('uid-1', {
      groups: ['feuerwehr'],
      isAdmin: true,
      authorized: true,
    });
  });

  it('verweigert einen Benutzer ohne Freigabe', async () => {
    getMock.mockResolvedValue(userDoc({ authorized: false }));

    const result = await mintFirebaseCustomToken('uid-1');

    expect(result.token).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('verweigert einen Benutzer ohne Dokument', async () => {
    getMock.mockResolvedValue(userDoc(undefined));

    const result = await mintFirebaseCustomToken('uid-1');

    expect(result.token).toBeUndefined();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('fällt ohne Gruppen auf allUsers zurück', async () => {
    getMock.mockResolvedValue(userDoc({ authorized: true }));

    await mintFirebaseCustomToken('uid-1');

    expect(createCustomTokenMock).toHaveBeenCalledWith('uid-1', {
      groups: ['allUsers'],
      isAdmin: false,
      authorized: true,
    });
  });

  it('nimmt einen abgelaufenen Einsatz-Gast nicht auf', async () => {
    getMock.mockResolvedValue(
      userDoc({
        authorized: true,
        firecall: 'call-1',
        firecallExpiresAt: Date.now() - 1000,
      }),
    );

    const result = await mintFirebaseCustomToken('uid-1');

    expect(result.token).toBeUndefined();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('nimmt einen gültigen Einsatz-Gast samt Einsatz-Claims auf', async () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    getMock.mockResolvedValue(
      userDoc({
        authorized: true,
        firecall: 'call-1',
        firecallWrite: true,
        firecallExpiresAt: expiresAt,
      }),
    );

    const result = await mintFirebaseCustomToken('uid-1');

    expect(result).toEqual({ token: 'minted-token' });
    expect(createCustomTokenMock).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({
        firecall: 'call-1',
        firecallExpires: expiresAt,
      }),
    );
  });
});
