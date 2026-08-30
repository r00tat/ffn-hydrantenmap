import { describe, expect, it } from 'vitest';
import {
  classifyAuthStorage,
  collectAuthDiagnostics,
  formatAuthDiagnostics,
} from './authDiagnostics';

const KEYS = [
  'firebase:pendingRedirect:AIza…:[DEFAULT]-firebaseui-temp',
  'firebase:authUser:AIza…:[DEFAULT]',
  'firebase:oauthHelperState',
  'firebaseui::redirectStatus',
  'fbAuth',
  'unrelated',
];

describe('classifyAuthStorage', () => {
  it('ordnet die Firebase-Schluessel den Phasen zu', () => {
    const c = classifyAuthStorage(KEYS);
    expect(c.pendingRedirect).toHaveLength(1);
    expect(c.authUser).toHaveLength(1);
    expect(c.handoff).toEqual(['firebase:oauthHelperState']);
    expect(c.firebaseui).toEqual(['firebaseui::redirectStatus']);
  });

  it('laesst fremde Schluessel weg', () => {
    const c = classifyAuthStorage(KEYS);
    const all = [
      ...c.pendingRedirect,
      ...c.authUser,
      ...c.handoff,
      ...c.firebaseui,
    ];
    expect(all).not.toContain('fbAuth');
    expect(all).not.toContain('unrelated');
  });

  it('kommt mit einem leeren Speicher zurecht', () => {
    expect(classifyAuthStorage([])).toEqual({
      pendingRedirect: [],
      authUser: [],
      handoff: [],
      firebaseui: [],
    });
  });
});

describe('collectAuthDiagnostics', () => {
  it('fuehrt beide Speicher zusammen', () => {
    const d = collectAuthDiagnostics({
      phase: 'mount',
      signInFlow: 'redirect',
      authDomain: 'localhost:3000',
      currentUser: null,
      href: 'https://localhost:3000/login',
      sessionKeys: ['firebase:pendingRedirect:AIza…:[DEFAULT]-firebaseui-temp'],
      localKeys: ['firebase:authUser:AIza…:[DEFAULT]'],
    });
    expect(d.pendingRedirect).toHaveLength(1);
    expect(d.authUser).toHaveLength(1);
    expect(d.phase).toBe('mount');
    expect(d.signInFlow).toBe('redirect');
  });
});

describe('formatAuthDiagnostics', () => {
  const base = {
    phase: 'Seitenaufbau',
    signInFlow: 'redirect' as const,
    authDomain: 'localhost:3000',
    currentUser: null,
    href: 'https://localhost:3000/login',
  };

  it('nennt die Schluessel in einer Zeile', () => {
    const line = formatAuthDiagnostics(
      collectAuthDiagnostics({
        ...base,
        sessionKeys: ['firebase:pendingRedirect:AIza:[DEFAULT]-firebaseui-temp'],
        localKeys: [],
      }),
    );
    expect(line).toContain('authDomain=localhost:3000');
    expect(line).toContain('flow=redirect');
    expect(line).toContain('user=-');
    expect(line).toContain(
      'pendingRedirect=1 [firebase:pendingRedirect:AIza:[DEFAULT]-firebaseui-temp]',
    );
    expect(line).not.toContain('\n');
  });

  it('laesst leere Gruppen kurz', () => {
    const line = formatAuthDiagnostics(
      collectAuthDiagnostics({ ...base, sessionKeys: [], localKeys: [] }),
    );
    expect(line).toContain('pendingRedirect=0');
    expect(line).not.toContain('pendingRedirect=0 [');
  });
});
