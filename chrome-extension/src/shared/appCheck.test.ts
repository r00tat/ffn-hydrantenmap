import { describe, it, expect, vi, beforeEach } from 'vitest';

const { initializeAppCheckMock, customProviderMock } = vi.hoisted(() => ({
  initializeAppCheckMock: vi.fn(() => ({ name: 'app-check' })),
  customProviderMock: vi.fn(function CustomProvider(
    this: { options: unknown },
    options: unknown
  ) {
    this.options = options;
  }),
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: initializeAppCheckMock,
  CustomProvider: customProviderMock,
}));

import {
  APPCHECK_ENDPOINT,
  fetchAppCheckToken,
  initExtensionAppCheck,
} from './appCheck';

function authWithUser(idToken = 'id-token-123') {
  return {
    currentUser: { getIdToken: vi.fn(async () => idToken) },
  } as any;
}

describe('fetchAppCheckToken', () => {
  it('exchanges the Firebase ID token for an App Check token', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'ac-token', expireTimeMillis: 1785000000000 }),
    })) as any;

    const result = await fetchAppCheckToken(authWithUser(), fetchImpl);

    expect(result).toEqual({
      token: 'ac-token',
      expireTimeMillis: 1785000000000,
    });
    expect(fetchImpl).toHaveBeenCalledWith(APPCHECK_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer id-token-123' },
    });
  });

  it('targets the Einsatzkarte api endpoint', () => {
    expect(APPCHECK_ENDPOINT).toBe('https://einsatz.ffnd.at/api/appcheck');
  });

  it('fails when nobody is signed in', async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchAppCheckToken({ currentUser: null } as any, fetchImpl as any)
    ).rejects.toThrow(/no signed in user/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails on a non-ok response instead of returning a broken token', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'your user is not authorized' }),
    })) as any;

    await expect(fetchAppCheckToken(authWithUser(), fetchImpl)).rejects.toThrow(
      /403/
    );
  });

  it('fails when the response carries no token', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ expireTimeMillis: 1 }),
    })) as any;

    await expect(fetchAppCheckToken(authWithUser(), fetchImpl)).rejects.toThrow(
      /token/i
    );
  });
});

describe('initExtensionAppCheck', () => {
  beforeEach(() => {
    initializeAppCheckMock.mockClear();
    customProviderMock.mockClear();
  });

  it('initializes App Check with a custom provider and auto refresh', () => {
    const app = { name: 'ext-app' } as any;

    initExtensionAppCheck(app, authWithUser());

    expect(customProviderMock).toHaveBeenCalledTimes(1);
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
    const [passedApp, options] = initializeAppCheckMock.mock.calls[0] as any;
    expect(passedApp).toBe(app);
    expect(options.isTokenAutoRefreshEnabled).toBe(true);
  });

  it('does not throw when App Check cannot be initialized', () => {
    initializeAppCheckMock.mockImplementationOnce(() => {
      throw new Error('no indexeddb in this context');
    });

    expect(() =>
      initExtensionAppCheck({ name: 'ext-app' } as any, authWithUser())
    ).not.toThrow();
  });

  it('wires the provider to the token exchange', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'ac-token', expireTimeMillis: 42 }),
    })) as any;

    initExtensionAppCheck({ name: 'ext-app' } as any, authWithUser(), fetchImpl);

    const providerOptions = customProviderMock.mock.calls[0]![0] as any;
    await expect(providerOptions.getToken()).resolves.toEqual({
      token: 'ac-token',
      expireTimeMillis: 42,
    });
  });
});
