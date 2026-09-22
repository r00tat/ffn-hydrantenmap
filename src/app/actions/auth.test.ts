import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  verifyJwtMock,
  verifyIdTokenMock,
  createCustomTokenMock,
  userDocGetMock,
} = vi.hoisted(() => ({
  verifyJwtMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  createCustomTokenMock: vi.fn(async () => 'firebase-custom-token'),
  userDocGetMock: vi.fn(),
}));

vi.mock('./jwt', () => ({
  verifyJwt: verifyJwtMock,
}));

// `actionUserRequired` zieht NextAuth mit in den Modulgraphen, das im
// Testlauf nicht aufloest. Der Share-Link-Weg benutzt den Waechter nicht.
vi.mock('../auth', () => ({
  actionUserRequired: vi.fn(async () => ({ user: { id: 'uid-1' } })),
}));

vi.mock('../../server/firebase/admin', () => ({
  firebaseAuth: {
    createCustomToken: createCustomTokenMock,
    verifyIdToken: verifyIdTokenMock,
  },
  firestore: {
    collection: () => ({
      doc: () => ({ get: userDocGetMock }),
    }),
  },
}));

const {
  exchangeCustomJwtForFirebaseToken,
  exchangeNativeIdTokenForFirebaseToken,
} = await import('./auth');

function userDoc(data: Record<string, unknown> | undefined) {
  return { exists: data !== undefined, data: () => data };
}

/** Gäste brauchen ein Ablaufdatum in der Zukunft, sonst gelten sie als tot. */
function future() {
  return Date.now() + 60 * 60 * 1000;
}

beforeEach(() => {
  vi.clearAllMocks();
  createCustomTokenMock.mockResolvedValue('firebase-custom-token');
});

describe('exchangeCustomJwtForFirebaseToken', () => {
  beforeEach(() => {
    verifyJwtMock.mockResolvedValue({ sub: 'guest-uid' });
  });

  it('takes the permissions from the user document, not from the token', async () => {
    // Das JWT behauptet Schreibrecht, das Benutzerdokument sagt nur Lesen —
    // maßgeblich ist das Dokument, damit ein Admin nachträglich entziehen kann.
    const expiresAt = future();
    verifyJwtMock.mockResolvedValue({
      sub: 'guest-uid',
      firecall: 'fc1',
      firecallWrite: true,
      isAdmin: true,
    });
    userDocGetMock.mockResolvedValue(
      userDoc({
        authorized: true,
        groups: ['allUsers'],
        firecall: 'fc1',
        firecallWrite: false,
        firecallExpiresAt: expiresAt,
      })
    );

    const result = await exchangeCustomJwtForFirebaseToken('jwt');

    expect(result).toEqual({ token: 'firebase-custom-token' });
    expect(createCustomTokenMock).toHaveBeenCalledWith('guest-uid', {
      groups: ['allUsers'],
      isAdmin: false,
      authorized: true,
      firecall: 'fc1',
      firecallWrite: false,
      firecallExpires: expiresAt,
    });
  });

  it('grants write access to guests created before the write flag existed', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({
        authorized: true,
        groups: ['allUsers'],
        firecall: 'fc1',
        firecallExpiresAt: future(),
      })
    );

    await exchangeCustomJwtForFirebaseToken('jwt');

    expect(createCustomTokenMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({ firecallWrite: true })
    );
  });

  it('omits the firecall claims for users without a firecall', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['ffnd'], isAdmin: true })
    );

    await exchangeCustomJwtForFirebaseToken('jwt');

    expect(createCustomTokenMock).toHaveBeenCalledWith('guest-uid', {
      groups: ['ffnd'],
      isAdmin: true,
      authorized: true,
    });
  });

  it('rejects a guest whose authorization was revoked', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: false, firecall: 'fc1' })
    );

    const result = await exchangeCustomJwtForFirebaseToken('jwt');

    expect(result.token).toBeUndefined();
    expect(result.error).toBe('Invalid token');
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('rejects a guest whose link has expired', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({
        authorized: true,
        groups: ['allUsers'],
        firecall: 'fc1',
        firecallExpiresAt: Date.now() - 1000,
      })
    );

    expect(await exchangeCustomJwtForFirebaseToken('jwt')).toEqual({
      error: 'Token expired',
    });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('rejects a guest from before the expiry feature', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['allUsers'], firecall: 'fc1' })
    );

    expect(await exchangeCustomJwtForFirebaseToken('jwt')).toEqual({
      error: 'Token expired',
    });
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('still exchanges tokens for regular users without an expiry', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['allUsers', 'ffnd'] })
    );

    expect(await exchangeCustomJwtForFirebaseToken('jwt')).toEqual({
      token: 'firebase-custom-token',
    });
  });

  it('rejects a guest whose user document was deleted', async () => {
    userDocGetMock.mockResolvedValue(userDoc(undefined));

    const result = await exchangeCustomJwtForFirebaseToken('jwt');

    expect(result.token).toBeUndefined();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('reports an expired token separately', async () => {
    verifyJwtMock.mockRejectedValue(
      Object.assign(new Error('expired'), { code: 'ERR_JWT_EXPIRED' })
    );

    expect(await exchangeCustomJwtForFirebaseToken('jwt')).toEqual({
      error: 'Token expired',
    });
  });
});

describe('exchangeNativeIdTokenForFirebaseToken', () => {
  beforeEach(() => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'native-uid' });
  });

  it('mints a token for a verified native session', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['ffnd'], isAdmin: true })
    );

    expect(await exchangeNativeIdTokenForFirebaseToken('id-token')).toEqual({
      token: 'firebase-custom-token',
    });
    // `checkRevoked` — sonst traegt ein abgemeldetes Geraet seine alte
    // native Sitzung weiter in die Weboberflaeche.
    expect(verifyIdTokenMock).toHaveBeenCalledWith('id-token', true);
    expect(createCustomTokenMock).toHaveBeenCalledWith('native-uid', {
      groups: ['ffnd'],
      isAdmin: true,
      authorized: true,
    });
  });

  it('takes the permissions from the user document, not from the id token', async () => {
    // Das ID-Token belegt nur, *wer* das Geraet ist. Ein dort noch
    // eingebranntes Admin-Recht darf nicht wieder aufleben.
    verifyIdTokenMock.mockResolvedValue({
      uid: 'native-uid',
      isAdmin: true,
      groups: ['ffnd', 'geheim'],
    });
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['ffnd'] })
    );

    await exchangeNativeIdTokenForFirebaseToken('id-token');

    expect(createCustomTokenMock).toHaveBeenCalledWith('native-uid', {
      groups: ['ffnd'],
      isAdmin: false,
      authorized: true,
    });
  });

  it('refuses an id token that does not verify', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('token revoked'));

    const result = await exchangeNativeIdTokenForFirebaseToken('id-token');

    expect(result.token).toBeUndefined();
    expect(result.error).toBe('Invalid token');
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('refuses a user whose authorization was withdrawn', async () => {
    userDocGetMock.mockResolvedValue(userDoc({ authorized: false }));

    const result = await exchangeNativeIdTokenForFirebaseToken('id-token');

    expect(result.token).toBeUndefined();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('refuses an empty token without asking the admin sdk', async () => {
    const result = await exchangeNativeIdTokenForFirebaseToken('');

    expect(result.error).toBe('Invalid token');
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});
