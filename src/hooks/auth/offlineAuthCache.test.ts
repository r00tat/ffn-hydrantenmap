// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  OFFLINE_AUTH_MAX_AGE_MS,
  OFFLINE_AUTH_STORAGE_KEY,
  OfflineAuthData,
  clearOfflineAuth,
  loadOfflineAuth,
  saveOfflineAuth,
} from './offlineAuthCache';

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

function data(overrides: Partial<OfflineAuthData> = {}): OfflineAuthData {
  return {
    uid: 'uid-1',
    email: 'muster@example.com',
    displayName: 'Max Muster',
    isAuthorized: true,
    isAdmin: false,
    groups: ['ffnd', 'allUsers'],
    groupAdmin: ['ffnd'],
    fahrtenbuchGeraetemeister: [],
    myGroups: [{ id: 'ffnd', name: 'FF Neusiedl' }],
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('offlineAuthCache', () => {
  it('liest die gespeicherte Anmeldung für dieselbe UID zurück', () => {
    saveOfflineAuth(data(), NOW);
    const loaded = loadOfflineAuth('uid-1', NOW + 1000);
    expect(loaded?.isAuthorized).toBe(true);
    expect(loaded?.groups).toEqual(['ffnd', 'allUsers']);
    expect(loaded?.groupAdmin).toEqual(['ffnd']);
    expect(loaded?.myGroups).toEqual([{ id: 'ffnd', name: 'FF Neusiedl' }]);
    expect(loaded?.savedAt).toBe(NOW);
  });

  it('liefert nichts für eine andere UID', () => {
    // Gebunden an die Firebase-UID: Meldet sich am selben Gerät jemand anderer
    // an, darf er nicht die Rechte des Vorgängers erben.
    saveOfflineAuth(data(), NOW);
    expect(loadOfflineAuth('uid-2', NOW)).toBeNull();
  });

  it('liefert ohne UID den gespeicherten Eintrag (vorläufige Anzeige)', () => {
    saveOfflineAuth(data(), NOW);
    expect(loadOfflineAuth(undefined, NOW)?.uid).toBe('uid-1');
  });

  it('verfällt nach 90 Tagen und räumt den Eintrag weg', () => {
    saveOfflineAuth(data(), NOW);
    expect(OFFLINE_AUTH_MAX_AGE_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(loadOfflineAuth('uid-1', NOW + OFFLINE_AUTH_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadOfflineAuth('uid-1', NOW + OFFLINE_AUTH_MAX_AGE_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(OFFLINE_AUTH_STORAGE_KEY)).toBeNull();
  });

  it('verlängert einen Gastzugang nicht über sein Ende', () => {
    saveOfflineAuth(
      data({ firecall: 'einsatz-1', expiresAt: NOW + 60 * 60 * 1000 }),
      NOW,
    );
    expect(loadOfflineAuth('uid-1', NOW + 30 * 60 * 1000)?.firecall).toBe('einsatz-1');
    expect(loadOfflineAuth('uid-1', NOW + 2 * 60 * 60 * 1000)).toBeNull();
  });

  it('verwirft einen Zeitstempel aus der Zukunft', () => {
    // Eine verstellte Uhr darf die Ablaufzeit nicht beliebig verlängern.
    saveOfflineAuth(data(), NOW + 60 * 60 * 1000);
    expect(loadOfflineAuth('uid-1', NOW)).toBeNull();
  });

  it('speichert eine nicht freigegebene Anmeldung nicht und löscht die alte', () => {
    saveOfflineAuth(data(), NOW);
    saveOfflineAuth(data({ isAuthorized: false }), NOW);
    expect(loadOfflineAuth('uid-1', NOW)).toBeNull();
  });

  it('übersteht kaputtes JSON', () => {
    window.localStorage.setItem(OFFLINE_AUTH_STORAGE_KEY, '{kaputt');
    expect(loadOfflineAuth('uid-1', NOW)).toBeNull();
  });

  it('übersteht einen Eintrag ohne Pflichtfelder', () => {
    window.localStorage.setItem(
      OFFLINE_AUTH_STORAGE_KEY,
      JSON.stringify({ uid: 'uid-1', isAuthorized: true }),
    );
    expect(loadOfflineAuth('uid-1', NOW)).toBeNull();
  });

  it('löscht beim Abmelden', () => {
    saveOfflineAuth(data(), NOW);
    clearOfflineAuth();
    expect(loadOfflineAuth('uid-1', NOW)).toBeNull();
  });

  it('wirft nicht, wenn localStorage nicht verfügbar ist', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => saveOfflineAuth(data(), NOW)).not.toThrow();
      expect(loadOfflineAuth('uid-1', NOW)).toBeNull();
      expect(() => clearOfflineAuth()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
