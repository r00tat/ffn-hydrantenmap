import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockUser = {
  getIdToken: ReturnType<typeof vi.fn>;
  getIdTokenResult: ReturnType<typeof vi.fn>;
};

const hoisted = vi.hoisted(() => ({
  mockAuth: { currentUser: null as MockUser | null },
  firebaseTokenLoginMock: vi.fn(),
}));

vi.mock('../../components/firebase/firebase', () => ({
  auth: hoisted.mockAuth,
}));

vi.mock('../../app/firebaseAuth', () => ({
  firebaseTokenLogin: (token: string) => hoisted.firebaseTokenLoginMock(token),
}));

const { mockAuth, firebaseTokenLoginMock } = hoisted;

import { ensureFreshAuth, isAuthError } from './ensureFreshAuth';

function makeUser(expirationOffsetMs: number): MockUser {
  const expirationTime = new Date(Date.now() + expirationOffsetMs).toISOString();
  return {
    getIdToken: vi.fn().mockResolvedValue('fresh-token'),
    getIdTokenResult: vi.fn().mockResolvedValue({ expirationTime }),
  };
}

describe('ensureFreshAuth', () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
    firebaseTokenLoginMock.mockReset();
    firebaseTokenLoginMock.mockResolvedValue({ ok: true });
  });

  it('returns false when there is no current user', async () => {
    const result = await ensureFreshAuth();
    expect(result).toBe(false);
    expect(firebaseTokenLoginMock).not.toHaveBeenCalled();
  });

  it('skips token refresh when token is fresh', async () => {
    const user = makeUser(30 * 60 * 1000);
    mockAuth.currentUser = user;

    const result = await ensureFreshAuth();

    expect(result).toBe(true);
    expect(user.getIdToken).not.toHaveBeenCalledWith(true);
    expect(firebaseTokenLoginMock).not.toHaveBeenCalled();
  });

  it('refreshes Firebase token and server session when token is near expiry', async () => {
    const user = makeUser(60 * 1000); // expires in 60s
    mockAuth.currentUser = user;

    const result = await ensureFreshAuth();

    expect(result).toBe(true);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(firebaseTokenLoginMock).toHaveBeenCalledWith('fresh-token');
  });

  it('forces a server login when forceServerLogin is true, even with fresh token', async () => {
    const user = makeUser(30 * 60 * 1000);
    mockAuth.currentUser = user;

    await ensureFreshAuth(true);

    expect(firebaseTokenLoginMock).toHaveBeenCalledWith('fresh-token');
  });

  it('returns false when server login fails', async () => {
    const user = makeUser(60 * 1000);
    mockAuth.currentUser = user;
    firebaseTokenLoginMock.mockResolvedValueOnce({ error: 'signin failed' });

    const result = await ensureFreshAuth();

    expect(result).toBe(false);
  });

  it('de-duplicates concurrent callers', async () => {
    const user = makeUser(60 * 1000);
    mockAuth.currentUser = user;

    const [a, b, c] = await Promise.all([
      ensureFreshAuth(),
      ensureFreshAuth(),
      ensureFreshAuth(),
    ]);

    expect([a, b, c]).toEqual([true, true, true]);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(user.getIdToken).toHaveBeenCalledTimes(2); // once with true, once without
    expect(firebaseTokenLoginMock).toHaveBeenCalledTimes(1);
  });
});

describe('isAuthError', () => {
  it('detects Firestore permission-denied errors by code', () => {
    expect(isAuthError({ code: 'permission-denied' })).toBe(true);
  });

  it('detects Firebase auth error codes', () => {
    expect(isAuthError({ code: 'auth/id-token-expired' })).toBe(true);
  });

  it('detects unauthenticated errors by code', () => {
    expect(isAuthError({ code: 'unauthenticated' })).toBe(true);
  });

  it('detects auth errors by message text', () => {
    expect(
      isAuthError(new Error('Missing or insufficient permissions.')),
    ).toBe(true);
  });

  it('returns false for network errors', () => {
    expect(isAuthError({ code: 'unavailable' })).toBe(false);
  });

  it('returns false for unknown errors', () => {
    expect(isAuthError(new Error('Something else went wrong'))).toBe(false);
  });
});
