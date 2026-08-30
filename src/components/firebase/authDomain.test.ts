import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_PROXY_QUERY_PARAM,
  AUTH_PROXY_STORAGE_KEY,
  isAuthProxyEnabled,
  resolveAuthDomain,
  type AuthProxyWindow,
} from './authDomain';

function fakeWindow(
  search = '',
  stored: string | null = null,
  host = 'einsatz-dev.ffnd.at',
): AuthProxyWindow & { stored: string | null } {
  const win = {
    stored,
    location: { search, host, protocol: 'https:' },
    localStorage: {
      getItem: (key: string) =>
        key === AUTH_PROXY_STORAGE_KEY ? win.stored : null,
      setItem: (key: string, value: string) => {
        if (key === AUTH_PROXY_STORAGE_KEY) win.stored = value;
      },
    },
  };
  return win;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAuthProxyEnabled', () => {
  it('ist ohne Fenster (SSR) aus', () => {
    expect(isAuthProxyEnabled(undefined)).toBe(false);
  });

  it('folgt der Umgebungsvariable, wenn nichts anderes gesetzt ist', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(isAuthProxyEnabled(fakeWindow())).toBe(true);
  });

  it('ist ohne Umgebungsvariable aus', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(isAuthProxyEnabled(fakeWindow())).toBe(false);
  });

  it('wird per Query-Parameter eingeschaltet und gemerkt', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    const win = fakeWindow(`?${AUTH_PROXY_QUERY_PARAM}=1`);
    expect(isAuthProxyEnabled(win)).toBe(true);
    // Gemerkt heisst: beim naechsten Aufruf ohne den Parameter gilt sie noch.
    expect(isAuthProxyEnabled(fakeWindow('', win.stored))).toBe(true);
  });

  it('wird per Query-Parameter wieder abgeschaltet', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const win = fakeWindow(`?${AUTH_PROXY_QUERY_PARAM}=0`, 'true');
    expect(isAuthProxyEnabled(win)).toBe(false);
    expect(isAuthProxyEnabled(fakeWindow('', win.stored))).toBe(false);
  });

  it('schlaegt die Umgebungsvariable mit dem gemerkten Wert', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(isAuthProxyEnabled(fakeWindow('', 'true'))).toBe(true);
  });

  it('faellt auf die Umgebungsvariable zurueck, wenn localStorage wirft', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const win = fakeWindow();
    win.localStorage.getItem = () => {
      throw new Error('no storage');
    };
    expect(isAuthProxyEnabled(win)).toBe(true);
  });
});

describe('resolveAuthDomain', () => {
  it('laesst die konfigurierte Domain stehen, solange der Proxy aus ist', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(resolveAuthDomain('ffn-utils.firebaseapp.com', fakeWindow())).toBe(
      'ffn-utils.firebaseapp.com',
    );
  });

  it('nimmt bei aktivem Proxy den eigenen Host', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(resolveAuthDomain('ffn-utils.firebaseapp.com', fakeWindow())).toBe(
      'einsatz-dev.ffnd.at',
    );
  });

  it('bleibt beim konfigurierten Wert, wenn es kein Fenster gibt', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(resolveAuthDomain('ffn-utils.firebaseapp.com', undefined)).toBe(
      'ffn-utils.firebaseapp.com',
    );
  });
});

describe('resolveAuthDomain: nur unter https', () => {
  it('ignoriert den Proxy auf einer http-Origin', () => {
    // Das Firebase-SDK baut die Handler-URL immer als `https://<authDomain>`.
    // Auf `http://localhost:3000` zeigte der Proxy damit auf einen Port, an
    // dem kein TLS lauscht — der Login liefe ins Leere.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const win = fakeWindow();
    win.location.protocol = 'http:';
    expect(resolveAuthDomain('ffn-utils.firebaseapp.com', win)).toBe(
      'ffn-utils.firebaseapp.com',
    );
  });

  it('greift auf einer https-Origin', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const win = fakeWindow();
    win.location.protocol = 'https:';
    expect(resolveAuthDomain('ffn-utils.firebaseapp.com', win)).toBe(
      'einsatz-dev.ffnd.at',
    );
  });
});
