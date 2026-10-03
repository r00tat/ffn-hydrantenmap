// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFLINE_AUTH_STORAGE_KEY,
  loadOfflineAuth,
  saveOfflineAuth,
} from './auth/offlineAuthCache';

const mocks = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => Promise<void>),
  session: { data: null as unknown, status: 'unauthenticated' as string },
  offline: false,
  reconnect: [] as (() => void)[],
  getMyGroupsFromServer: vi.fn(),
  firebaseTokenLogin: vi.fn(),
  signOut: vi.fn(),
  authSignOut: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: { signOut: vi.fn() },
}));
vi.mock('next-auth/react', () => ({
  useSession: () => mocks.session,
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}));
vi.mock('../app/firebaseAuth', () => ({
  firebaseTokenLogin: (...args: unknown[]) => mocks.firebaseTokenLogin(...args),
}));
vi.mock('../app/groups/GroupAction', () => ({
  getMyGroupsFromServer: () => mocks.getMyGroupsFromServer(),
}));
vi.mock('../components/firebase/firebase', () => ({
  auth: {
    onAuthStateChanged: (cb: (user: unknown) => Promise<void>) => {
      mocks.authCallback = cb;
      return () => {};
    },
    currentUser: null,
    signOut: () => mocks.authSignOut(),
  },
  firestore: {},
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => new Promise(() => {})),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock('../lib/connectivity', () => ({
  isOffline: () => mocks.offline,
  onReconnect: (cb: () => void) => {
    mocks.reconnect.push(cb);
    return () => {};
  },
}));
vi.mock('./auth/ensureFreshAuth', () => ({
  ensureFreshAuth: vi.fn(async () => true),
}));

import useFirebaseLoginObserver, {
  OFFLINE_LOGIN_TIMEOUT_MS,
} from './useFirebaseLoginObserver';

const cachedLogin = {
  uid: 'uid-1',
  email: 'muster@example.com',
  isAuthorized: true,
  isAdmin: false,
  groups: ['ffnd', 'allUsers'],
  groupAdmin: ['ffnd'],
  myGroups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
};

/** Ein Firebase-Benutzer, dessen Token-Abruf scheitert oder hängt. */
function offlineUser(mode: 'reject' | 'hang') {
  const fail = () =>
    mode === 'reject'
      ? Promise.reject(Object.assign(new Error('offline'), { code: 'auth/network-request-failed' }))
      : new Promise<never>(() => {});
  return {
    uid: 'uid-1',
    email: 'muster@example.com',
    displayName: 'Max Muster',
    photoURL: null,
    getIdToken: vi.fn(fail),
    getIdTokenResult: vi.fn(fail),
  };
}

function onlineUser() {
  return {
    uid: 'uid-1',
    email: 'muster@example.com',
    displayName: 'Max Muster',
    photoURL: null,
    getIdToken: vi.fn(async () => 'token'),
    getIdTokenResult: vi.fn(async () => ({
      expirationTime: new Date(Date.now() + 3600_000).toISOString(),
      claims: { authorized: true, groups: ['ffnd', 'allUsers'], isAdmin: false },
    })),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.authCallback = null;
  mocks.session = { data: null, status: 'unauthenticated' };
  mocks.offline = false;
  mocks.reconnect = [];
  mocks.getMyGroupsFromServer.mockReset();
  mocks.firebaseTokenLogin.mockReset();
  mocks.signOut.mockReset();
  mocks.authSignOut.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFirebaseLoginObserver: Kaltstart ohne Netz', () => {
  it('versorgt sich offline aus dem Zwischenspeicher, wenn das Token nicht erneuert werden kann', async () => {
    saveOfflineAuth(cachedLogin);
    mocks.offline = true;
    const { result } = renderHook(() => useFirebaseLoginObserver());

    await act(async () => {
      await mocks.authCallback?.(offlineUser('reject'));
    });

    expect(result.current.isAuthorized).toBe(true);
    expect(result.current.groups).toEqual(['ffnd', 'allUsers']);
    expect(result.current.groupAdmin).toEqual(['ffnd']);
    expect(result.current.myGroups).toEqual([{ id: 'ffnd', name: 'FF Neusiedl' }]);
    expect(result.current.hasFirebaseUser).toBe(true);
    expect(result.current.isAuthLoading).toBe(false);
    expect(result.current.offlineAuth).toBe(true);
    expect(result.current.loginStep).toBe('done');
  });

  it('schaltet nach der Zeitgrenze auf den Zwischenspeicher um, wenn der Server hängt', async () => {
    // WLAN ohne Internet: `navigator.onLine` sagt online, aber nichts kommt an.
    vi.useFakeTimers();
    saveOfflineAuth(cachedLogin);
    const { result } = renderHook(() => useFirebaseLoginObserver());

    await act(async () => {
      void mocks.authCallback?.(offlineUser('hang'));
    });
    expect(result.current.isAuthorized).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(OFFLINE_LOGIN_TIMEOUT_MS);
    });
    expect(result.current.isAuthorized).toBe(true);
    expect(result.current.offlineAuth).toBe(true);
  });

  it('nutzt den Zwischenspeicher eines anderen Benutzers nicht', async () => {
    saveOfflineAuth({ ...cachedLogin, uid: 'someone-else' });
    mocks.offline = true;
    const { result } = renderHook(() => useFirebaseLoginObserver());

    await act(async () => {
      await mocks.authCallback?.(offlineUser('reject'));
    });

    expect(result.current.isAuthorized).toBe(false);
    // Kein endloser Ladezustand: der Login-Bildschirm erscheint.
    expect(result.current.isAuthLoading).toBe(false);
  });

  it('erneuert den Zwischenspeicher online aus der bestätigten Sitzung', async () => {
    mocks.session = {
      status: 'authenticated',
      data: {
        user: {
          id: 'uid-1',
          isAuthorized: true,
          isAdmin: false,
          groups: ['ffnd', 'allUsers'],
          groupAdmin: ['ffnd'],
        },
      },
    };
    mocks.getMyGroupsFromServer.mockResolvedValue([{ id: 'ffnd', name: 'FF Neusiedl' }]);
    renderHook(() => useFirebaseLoginObserver());

    await act(async () => {
      await mocks.authCallback?.(onlineUser());
    });

    const stored = loadOfflineAuth('uid-1');
    expect(stored?.isAuthorized).toBe(true);
    expect(stored?.groupAdmin).toEqual(['ffnd']);
    expect(stored?.myGroups).toEqual([{ id: 'ffnd', name: 'FF Neusiedl' }]);
  });

  it('schreibt ohne bestätigte Sitzung nichts in den Zwischenspeicher', async () => {
    mocks.offline = true;
    saveOfflineAuth(cachedLogin, Date.now() - 1000);
    const before = window.localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY);
    renderHook(() => useFirebaseLoginObserver());

    await act(async () => {
      await mocks.authCallback?.(offlineUser('reject'));
    });

    // Unverändert: Die Frist verlängert sich offline nicht von selbst.
    expect(window.localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY)).toBe(before);
  });

  it('löscht den Zwischenspeicher beim Abmelden', async () => {
    saveOfflineAuth(cachedLogin);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
    const { result } = renderHook(() => useFirebaseLoginObserver());

    await act(async () => {
      await result.current.signOut();
    });

    expect(window.localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY)).toBeNull();
  });

  it('holt die Anmeldung am Server beim Reconnect nach', async () => {
    saveOfflineAuth(cachedLogin);
    mocks.offline = true;
    const { result } = renderHook(() => useFirebaseLoginObserver());
    await act(async () => {
      await mocks.authCallback?.(offlineUser('reject'));
    });
    expect(result.current.offlineAuth).toBe(true);

    const { auth } = await import('../components/firebase/firebase');
    (auth as { currentUser: unknown }).currentUser = onlineUser();
    mocks.offline = false;
    mocks.getMyGroupsFromServer.mockResolvedValue([]);
    mocks.firebaseTokenLogin.mockResolvedValue({});

    await act(async () => {
      for (const cb of mocks.reconnect) cb();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.firebaseTokenLogin).toHaveBeenCalled();
    expect(result.current.offlineAuth).toBe(false);
    (auth as { currentUser: unknown }).currentUser = null;
  });
});
