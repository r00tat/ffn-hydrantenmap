import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  verifyJwtMock,
  createJwtMock,
  createCustomTokenMock,
  createUserMock,
  setCustomUserClaimsMock,
  userDocGetMock,
  userDocSetMock,
  authorizedForFirecallMock,
} = vi.hoisted(() => ({
  verifyJwtMock: vi.fn(),
  createJwtMock: vi.fn(async () => 'signed-jwt'),
  createCustomTokenMock: vi.fn(async () => 'firebase-custom-token'),
  createUserMock: vi.fn(async () => ({ uid: 'guest-uid' })),
  setCustomUserClaimsMock: vi.fn(async () => undefined),
  userDocGetMock: vi.fn(),
  userDocSetMock: vi.fn(async () => undefined),
  authorizedForFirecallMock: vi.fn(),
}));

vi.mock('./jwt', () => ({
  createJwt: createJwtMock,
  verifyJwt: verifyJwtMock,
}));

vi.mock('../auth', () => ({
  actionUserAuthorizedForFirecall: authorizedForFirecallMock,
}));

vi.mock('../../server/firebase/admin', () => ({
  firebaseAuth: {
    createUser: createUserMock,
    setCustomUserClaims: setCustomUserClaimsMock,
    createCustomToken: createCustomTokenMock,
  },
  firestore: {
    collection: () => ({
      doc: () => ({ get: userDocGetMock, set: userDocSetMock }),
    }),
  },
}));

const {
  createCustomFirebaseTokenForFirecall,
  exchangeCustomJwtForFirebaseToken,
} = await import('./auth');

function userDoc(data: Record<string, unknown> | undefined) {
  return { exists: data !== undefined, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  createJwtMock.mockResolvedValue('signed-jwt');
  createCustomTokenMock.mockResolvedValue('firebase-custom-token');
  createUserMock.mockResolvedValue({ uid: 'guest-uid' });
  authorizedForFirecallMock.mockResolvedValue({
    id: 'fc1',
    name: 'Brand Hauptstraße',
    group: 'ffnd',
  });
});

describe('createCustomFirebaseTokenForFirecall', () => {
  it('requires write access on the firecall', async () => {
    await createCustomFirebaseTokenForFirecall('fc1', {
      name: 'ORF',
      canWrite: false,
    });

    expect(authorizedForFirecallMock).toHaveBeenCalledWith('fc1', {
      requireWrite: true,
    });
  });

  it('stores the guest name and the requested access level', async () => {
    const result = await createCustomFirebaseTokenForFirecall('fc1', {
      name: '  Nachbarwehr Weiden  ',
      canWrite: true,
    });

    expect(result).toEqual({ token: 'signed-jwt' });
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Nachbarwehr Weiden (Einsatz-Gast Brand Hauptstraße)',
      }),
    );
    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ firecall: 'fc1', firecallWrite: true }),
    );
    expect(setCustomUserClaimsMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({ firecall: 'fc1', firecallWrite: true }),
    );
  });

  it('stores read-only access when requested', async () => {
    await createCustomFirebaseTokenForFirecall('fc1', {
      name: 'ORF',
      canWrite: false,
    });

    expect(userDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ firecallWrite: false }),
    );
    expect(setCustomUserClaimsMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({ firecallWrite: false }),
    );
  });

  it('rejects an empty guest name', async () => {
    const result = await createCustomFirebaseTokenForFirecall('fc1', {
      name: '   ',
      canWrite: false,
    });

    expect(result.error).toBeDefined();
    expect(createUserMock).not.toHaveBeenCalled();
  });
});

describe('exchangeCustomJwtForFirebaseToken', () => {
  beforeEach(() => {
    verifyJwtMock.mockResolvedValue({ sub: 'guest-uid' });
  });

  it('takes the permissions from the user document, not from the token', async () => {
    // Das JWT behauptet Schreibrecht, das Benutzerdokument sagt nur Lesen —
    // maßgeblich ist das Dokument, damit ein Admin nachträglich entziehen kann.
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
      }),
    );

    const result = await exchangeCustomJwtForFirebaseToken('jwt');

    expect(result).toEqual({ token: 'firebase-custom-token' });
    expect(createCustomTokenMock).toHaveBeenCalledWith('guest-uid', {
      groups: ['allUsers'],
      isAdmin: false,
      authorized: true,
      firecall: 'fc1',
      firecallWrite: false,
    });
  });

  it('grants write access to guests created before the flag existed', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['allUsers'], firecall: 'fc1' }),
    );

    await exchangeCustomJwtForFirebaseToken('jwt');

    expect(createCustomTokenMock).toHaveBeenCalledWith(
      'guest-uid',
      expect.objectContaining({ firecallWrite: true }),
    );
  });

  it('omits the firecall claims for users without a firecall', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, groups: ['ffnd'], isAdmin: true }),
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
      userDoc({ authorized: false, firecall: 'fc1' }),
    );

    const result = await exchangeCustomJwtForFirebaseToken('jwt');

    expect(result.token).toBeUndefined();
    expect(result.error).toBe('Invalid token');
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('rejects a guest whose user document was deleted', async () => {
    userDocGetMock.mockResolvedValue(userDoc(undefined));

    const result = await exchangeCustomJwtForFirebaseToken('jwt');

    expect(result.token).toBeUndefined();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('reports an expired token separately', async () => {
    verifyJwtMock.mockRejectedValue(
      Object.assign(new Error('expired'), { code: 'ERR_JWT_EXPIRED' }),
    );

    expect(await exchangeCustomJwtForFirebaseToken('jwt')).toEqual({
      error: 'Token expired',
    });
  });
});
