import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Passkey } from '../../common/passkey';

vi.mock('server-only', () => ({}));

const {
  verifyJwtMock,
  createJwtMock,
  createCustomTokenMock,
  userDocGetMock,
  requestOriginMock,
  getPasskeyMock,
  listPasskeysForUserMock,
  createPasskeyMock,
  updatePasskeyUsageMock,
  updatePasskeyLabelMock,
  deletePasskeyDocMock,
  actionUserRequiredMock,
  headersMock,
  generateRegistrationOptionsMock,
  verifyRegistrationResponseMock,
  generateAuthenticationOptionsMock,
  verifyAuthenticationResponseMock,
} = vi.hoisted(() => ({
  verifyJwtMock: vi.fn(),
  createJwtMock: vi.fn(async () => 'challenge-token'),
  createCustomTokenMock: vi.fn(async () => 'firebase-custom-token'),
  userDocGetMock: vi.fn(),
  requestOriginMock: vi.fn(
    async (): Promise<string | undefined> => 'https://einsatz.ffnd.at',
  ),
  getPasskeyMock: vi.fn(async (_id: string): Promise<Passkey | undefined> => undefined),
  listPasskeysForUserMock: vi.fn(
    async (_uid: string): Promise<Passkey[]> => [],
  ),
  createPasskeyMock: vi.fn(async (_passkey: Passkey): Promise<void> => {}),
  updatePasskeyUsageMock: vi.fn(async () => undefined),
  updatePasskeyLabelMock: vi.fn(async () => undefined),
  deletePasskeyDocMock: vi.fn(async () => undefined),
  actionUserRequiredMock: vi.fn(),
  headersMock: vi.fn(async () => ({ get: () => 'test-agent' })),
  generateRegistrationOptionsMock: vi.fn(),
  verifyRegistrationResponseMock: vi.fn(),
  generateAuthenticationOptionsMock: vi.fn(),
  verifyAuthenticationResponseMock: vi.fn(),
}));

vi.mock('./jwt', () => ({
  createJwt: createJwtMock,
  verifyJwt: verifyJwtMock,
}));

vi.mock('../auth', () => ({
  actionUserRequired: actionUserRequiredMock,
}));

vi.mock('next/headers', () => ({ headers: headersMock }));

vi.mock('../../server/auth/baseUrl', () => ({
  requestOrigin: requestOriginMock,
  rpIdFromOrigin: (origin: string) => new URL(origin).hostname,
}));

vi.mock('../../server/auth/passkeyStore', () => ({
  getPasskey: getPasskeyMock,
  listPasskeysForUser: listPasskeysForUserMock,
  createPasskey: createPasskeyMock,
  updatePasskeyUsage: updatePasskeyUsageMock,
  updatePasskeyLabel: updatePasskeyLabelMock,
  deletePasskeyDoc: deletePasskeyDocMock,
}));

vi.mock('../../server/firebase/admin', () => ({
  firebaseAuth: { createCustomToken: createCustomTokenMock },
  firestore: {
    collection: () => ({ doc: () => ({ get: userDocGetMock }) }),
  },
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: generateRegistrationOptionsMock,
  verifyRegistrationResponse: verifyRegistrationResponseMock,
  generateAuthenticationOptions: generateAuthenticationOptionsMock,
  verifyAuthenticationResponse: verifyAuthenticationResponseMock,
}));

const {
  startPasskeyRegistration,
  finishPasskeyRegistration,
  startPasskeyAuthentication,
  finishPasskeyAuthentication,
  listPasskeys,
  renamePasskey,
  deletePasskey,
} = await import('./passkey');

const STORED_PASSKEY: Passkey = {
  id: 'cred-1',
  uid: 'user-1',
  // base64url für "public-key-bytes" — der Inhalt ist egal, die Verifikation
  // ist gemockt; entscheidend ist, dass es dekodierbar bleibt.
  publicKey: 'cHVibGljLWtleS1ieXRlcw',
  counter: 5,
  transports: ['internal'],
  deviceType: 'multiDevice',
  backedUp: true,
  rpId: 'einsatz.ffnd.at',
  origin: 'https://einsatz.ffnd.at',
  aaguid: 'aaguid-1',
  label: 'MacBook',
  userAgent: 'test-agent',
  createdAt: '2026-08-01T10:00:00.000Z',
};

function authChallenge(overrides: Record<string, unknown> = {}) {
  return {
    typ: 'webauthn-auth',
    challenge: 'challenge-abc',
    rpId: 'einsatz.ffnd.at',
    origin: 'https://einsatz.ffnd.at',
    ...overrides,
  };
}

function authResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cred-1',
    rawId: 'cred-1',
    type: 'public-key',
    clientExtensionResults: {},
    response: {},
    ...overrides,
  };
}

function userDoc(data: Record<string, unknown> | undefined) {
  return { exists: data !== undefined, data: () => data };
}

function verified(newCounter: number) {
  return {
    verified: true,
    authenticationInfo: {
      credentialID: 'cred-1',
      newCounter,
      userVerified: true,
      credentialDeviceType: 'multiDevice',
      credentialBackedUp: true,
      origin: 'https://einsatz.ffnd.at',
      rpID: 'einsatz.ffnd.at',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requestOriginMock.mockResolvedValue('https://einsatz.ffnd.at');
  createJwtMock.mockResolvedValue('challenge-token');
  createCustomTokenMock.mockResolvedValue('firebase-custom-token');
  listPasskeysForUserMock.mockResolvedValue([]);
  headersMock.mockResolvedValue({ get: () => 'test-agent' });
  actionUserRequiredMock.mockResolvedValue({
    user: { id: 'user-1', email: 'a@ff-neusiedlamsee.at', name: 'Anna' },
  });
  generateRegistrationOptionsMock.mockResolvedValue({
    challenge: 'challenge-abc',
    rp: { name: 'FFN Einsatzkarte', id: 'einsatz.ffnd.at' },
  });
  generateAuthenticationOptionsMock.mockResolvedValue({
    challenge: 'challenge-abc',
    rpId: 'einsatz.ffnd.at',
  });
  getPasskeyMock.mockResolvedValue({ ...STORED_PASSKEY });
  verifyAuthenticationResponseMock.mockResolvedValue(verified(6));
  verifyJwtMock.mockResolvedValue(authChallenge());
  userDocGetMock.mockResolvedValue(
    userDoc({ authorized: true, isAdmin: false, groups: ['ffnd'] }),
  );
});

describe('ceremony origin', () => {
  it('refuses to start authentication when the origin is not allowed', async () => {
    requestOriginMock.mockResolvedValue(undefined);
    await expect(startPasskeyAuthentication()).rejects.toThrow(
      /origin is not allowed/,
    );
  });

  it('refuses to start registration when the origin is not allowed', async () => {
    requestOriginMock.mockResolvedValue(undefined);
    await expect(startPasskeyRegistration()).rejects.toThrow(
      /origin is not allowed/,
    );
  });

  it('derives the rp id from the request origin, not from NEXTAUTH_URL', async () => {
    requestOriginMock.mockResolvedValue('https://einsatz-dev.ffnd.at');
    await startPasskeyAuthentication();
    expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpID: 'einsatz-dev.ffnd.at' }),
    );
  });

  it('asks for discoverable credentials without leaking which exist', async () => {
    await startPasskeyAuthentication();
    expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: [],
        userVerification: 'required',
      }),
    );
  });
});

describe('finishPasskeyAuthentication', () => {
  it('rejects a challenge token issued for registration', async () => {
    verifyJwtMock.mockResolvedValue(authChallenge({ typ: 'webauthn-reg' }));
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/wrong type/);
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('rejects an expired challenge token', async () => {
    verifyJwtMock.mockRejectedValue(
      Object.assign(new Error('expired'), { code: 'ERR_JWT_EXPIRED' }),
    );
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow();
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown credential', async () => {
    getPasskeyMock.mockResolvedValue(undefined);
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/unknown credential/);
  });

  it('rejects a credential registered on a different domain', async () => {
    getPasskeyMock.mockResolvedValue({
      ...STORED_PASSKEY,
      rpId: 'einsatz-dev.ffnd.at',
    });
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/different domain/);
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });

  it('rejects a replayed challenge', async () => {
    getPasskeyMock.mockResolvedValue({
      ...STORED_PASSKEY,
      lastChallenge: 'challenge-abc',
    });
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/already been used/);
  });

  it('rejects a user handle that belongs to another user', async () => {
    // base64url für "user-2"
    const userHandle = Buffer.from('user-2', 'utf8').toString('base64url');
    await expect(
      finishPasskeyAuthentication(
        'challenge-token',
        authResponse({ response: { userHandle } }) as never,
      ),
    ).rejects.toThrow(/user handle/);
  });

  it('accepts a matching user handle', async () => {
    const userHandle = Buffer.from('user-1', 'utf8').toString('base64url');
    const { token } = await finishPasskeyAuthentication(
      'challenge-token',
      authResponse({ response: { userHandle } }) as never,
    );
    expect(token).toBe('firebase-custom-token');
  });

  it('rejects a counter that did not increase', async () => {
    verifyAuthenticationResponseMock.mockResolvedValue(verified(5));
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/counter/);
  });

  it('accepts a constant zero counter from a cloud synced passkey', async () => {
    getPasskeyMock.mockResolvedValue({ ...STORED_PASSKEY, counter: 0 });
    verifyAuthenticationResponseMock.mockResolvedValue(verified(0));
    const { token } = await finishPasskeyAuthentication(
      'challenge-token',
      authResponse() as never,
    );
    expect(token).toBe('firebase-custom-token');
  });

  it('rejects when the signature could not be verified', async () => {
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: false,
      authenticationInfo: verified(6).authenticationInfo,
    });
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/could not be verified/);
  });

  it('refuses a de-authorized user despite a valid signature', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: false, isAdmin: true, groups: ['ffnd'] }),
    );
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/not authorized/);
    expect(createCustomTokenMock).not.toHaveBeenCalled();
  });

  it('refuses a user without a user document', async () => {
    userDocGetMock.mockResolvedValue(userDoc(undefined));
    await expect(
      finishPasskeyAuthentication('challenge-token', authResponse() as never),
    ).rejects.toThrow(/no user document/);
  });

  it('takes the claims from the user document, not from the request', async () => {
    userDocGetMock.mockResolvedValue(
      userDoc({ authorized: true, isAdmin: true, groups: ['ffnd', 'admin'] }),
    );
    await finishPasskeyAuthentication(
      'challenge-token',
      authResponse() as never,
    );
    expect(createCustomTokenMock).toHaveBeenCalledWith('user-1', {
      groups: ['ffnd', 'admin'],
      isAdmin: true,
      authorized: true,
    });
  });

  it('records the consumed challenge together with the new counter', async () => {
    await finishPasskeyAuthentication(
      'challenge-token',
      authResponse() as never,
    );
    expect(updatePasskeyUsageMock).toHaveBeenCalledWith(
      'cred-1',
      6,
      'challenge-abc',
    );
  });

  it('verifies against the origin from the signed challenge', async () => {
    await finishPasskeyAuthentication(
      'challenge-token',
      authResponse() as never,
    );
    expect(verifyAuthenticationResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'challenge-abc',
        expectedOrigin: 'https://einsatz.ffnd.at',
        expectedRPID: 'einsatz.ffnd.at',
        requireUserVerification: true,
      }),
    );
  });
});

describe('finishPasskeyRegistration', () => {
  const regChallenge = {
    typ: 'webauthn-reg',
    challenge: 'challenge-abc',
    rpId: 'einsatz.ffnd.at',
    origin: 'https://einsatz.ffnd.at',
    uid: 'user-1',
  };

  const regResponse = {
    id: 'cred-2',
    rawId: 'cred-2',
    type: 'public-key',
    clientExtensionResults: {},
    response: {},
  };

  beforeEach(() => {
    verifyJwtMock.mockResolvedValue(regChallenge);
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        fmt: 'none',
        aaguid: 'aaguid-2',
        credential: {
          id: 'cred-2',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal', 'hybrid'],
        },
        credentialType: 'public-key',
        attestationObject: new Uint8Array(),
        userVerified: true,
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        origin: 'https://einsatz.ffnd.at',
        rpID: 'einsatz.ffnd.at',
      },
    });
  });

  it('rejects a challenge issued for a different user', async () => {
    verifyJwtMock.mockResolvedValue({ ...regChallenge, uid: 'user-2' });
    await expect(
      finishPasskeyRegistration('challenge-token', regResponse as never),
    ).rejects.toThrow(/different user/);
    expect(createPasskeyMock).not.toHaveBeenCalled();
  });

  it('rejects an authentication challenge token', async () => {
    verifyJwtMock.mockResolvedValue(authChallenge());
    await expect(
      finishPasskeyRegistration('challenge-token', regResponse as never),
    ).rejects.toThrow(/wrong type/);
  });

  it('stores the attested domain, not a client supplied one', async () => {
    await finishPasskeyRegistration(
      'challenge-token',
      regResponse as never,
      'iPhone',
    );
    expect(createPasskeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cred-2',
        uid: 'user-1',
        rpId: 'einsatz.ffnd.at',
        origin: 'https://einsatz.ffnd.at',
        label: 'iPhone',
        transports: ['internal', 'hybrid'],
        deviceType: 'multiDevice',
        backedUp: true,
      }),
    );
  });

  it('never returns the public key to the client', async () => {
    const { passkey } = await finishPasskeyRegistration(
      'challenge-token',
      regResponse as never,
    );
    expect(passkey).not.toHaveProperty('publicKey');
    expect(passkey).not.toHaveProperty('uid');
  });

  it('truncates an overlong label', async () => {
    await finishPasskeyRegistration(
      'challenge-token',
      regResponse as never,
      'x'.repeat(250),
    );
    expect(createPasskeyMock.mock.calls[0][0].label).toHaveLength(100);
  });

  it('excludes already registered credentials of the same domain', async () => {
    listPasskeysForUserMock.mockResolvedValue([
      { ...STORED_PASSKEY },
      { ...STORED_PASSKEY, id: 'cred-dev', rpId: 'einsatz-dev.ffnd.at' },
    ]);
    await startPasskeyRegistration();
    expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCredentials: [{ id: 'cred-1', transports: ['internal'] }],
      }),
    );
  });

  it('requires a resident key so the login works without an e-mail', async () => {
    await startPasskeyRegistration();
    expect(generateRegistrationOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      }),
    );
  });
});

describe('passkey management', () => {
  it('lists only the projections of the own passkeys', async () => {
    listPasskeysForUserMock.mockResolvedValue([{ ...STORED_PASSKEY }]);
    const list = await listPasskeys();
    expect(listPasskeysForUserMock).toHaveBeenCalledWith('user-1');
    expect(list[0]).not.toHaveProperty('publicKey');
  });

  it('refuses to delete a passkey of another user', async () => {
    getPasskeyMock.mockResolvedValue({ ...STORED_PASSKEY, uid: 'user-2' });
    await expect(deletePasskey('cred-1')).rejects.toThrow(/not found/);
    expect(deletePasskeyDocMock).not.toHaveBeenCalled();
  });

  it('refuses to rename a passkey of another user', async () => {
    getPasskeyMock.mockResolvedValue({ ...STORED_PASSKEY, uid: 'user-2' });
    await expect(renamePasskey('cred-1', 'mine now')).rejects.toThrow(
      /not found/,
    );
    expect(updatePasskeyLabelMock).not.toHaveBeenCalled();
  });

  it('deletes an own passkey', async () => {
    await deletePasskey('cred-1');
    expect(deletePasskeyDocMock).toHaveBeenCalledWith('cred-1');
  });

  it('trims and truncates a new label', async () => {
    await renamePasskey('cred-1', `  ${'y'.repeat(250)}  `);
    expect(updatePasskeyLabelMock).toHaveBeenCalledWith(
      'cred-1',
      'y'.repeat(100),
    );
  });
});
