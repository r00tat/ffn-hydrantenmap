// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAuthFromSessionStorage,
  loadAuthFromSessionStorage,
  saveAuthToSessionStorage,
} from './sessionStorage';
import type { LoginData } from './types';

function inOneHour() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function loginData(overrides: Partial<LoginData> = {}): LoginData {
  return {
    isSignedIn: true,
    isAuthorized: true,
    isAdmin: false,
    isAuthLoading: false,
    hasFirebaseUser: true,
    myGroups: [],
    loginStep: 'done',
    expiration: inOneHour(),
    ...overrides,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('saveAuthToSessionStorage', () => {
  it('persists an authorized, non-refreshing session', () => {
    saveAuthToSessionStorage(loginData());
    expect(loadAuthFromSessionStorage()?.isAuthorized).toBe(true);
  });

  it('never persists hasFirebaseUser', () => {
    // Das Flag beschreibt den *aktuellen* Firebase-Auth-Zustand. Aus dem Cache
    // wiederhergestellt würde es behaupten, es gebe eine Firebase-Sitzung, und
    // damit genau die verfrühten Firestore-Listener auslösen, die es
    // verhindern soll.
    saveAuthToSessionStorage(loginData({ hasFirebaseUser: true }));
    expect(loadAuthFromSessionStorage()).not.toHaveProperty('hasFirebaseUser');
  });

  it('does not persist while a refresh is in flight', () => {
    saveAuthToSessionStorage(loginData({ isRefreshing: true }));
    expect(loadAuthFromSessionStorage()).toBeNull();
  });

  it('does not persist an unauthorized session', () => {
    saveAuthToSessionStorage(loginData({ isAuthorized: false }));
    expect(loadAuthFromSessionStorage()).toBeNull();
  });
});

describe('loadAuthFromSessionStorage', () => {
  it('ignores an expired entry', () => {
    saveAuthToSessionStorage(
      loginData({ expiration: new Date(Date.now() + 1000).toISOString() }),
    );
    // Eintrag künstlich altern lassen, statt die Uhr zu stellen.
    const stored = JSON.parse(
      window.sessionStorage.getItem('fbAuth') as string,
    );
    stored.expiration = new Date(Date.now() - 1000).toISOString();
    window.sessionStorage.setItem('fbAuth', JSON.stringify(stored));

    expect(loadAuthFromSessionStorage()).toBeNull();
  });

  it('ignores invalid JSON', () => {
    window.sessionStorage.setItem('fbAuth', 'not json');
    expect(loadAuthFromSessionStorage()).toBeNull();
  });

  it('returns null after clearing', () => {
    saveAuthToSessionStorage(loginData());
    clearAuthFromSessionStorage();
    expect(loadAuthFromSessionStorage()).toBeNull();
  });
});
