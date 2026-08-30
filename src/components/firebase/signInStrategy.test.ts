import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_PROXY_STORAGE_KEY, type AuthProxyWindow } from './authDomain';
import {
  shouldUseRedirectSignIn,
  SIGN_IN_FLOW_QUERY_PARAM,
  SIGN_IN_FLOW_STORAGE_KEY,
} from './signInStrategy';

function win(
  proxy: string | null = null,
  search = '',
  storedFlow: string | null = null,
): AuthProxyWindow {
  const values: Record<string, string | null> = {
    [AUTH_PROXY_STORAGE_KEY]: proxy,
    [SIGN_IN_FLOW_STORAGE_KEY]: storedFlow,
  };
  return {
    location: { search, host: 'einsatz-dev.ffnd.at', protocol: 'https:' },
    localStorage: {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shouldUseRedirectSignIn', () => {
  it('nimmt bei aktivem Proxy den Redirect — unabhaengig vom Geraet', () => {
    // Keine Geraeteerkennung mehr: Sie war die Stelle, an der der Login
    // lautlos auf den kaputten Popup-Weg zurueckfiel.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(shouldUseRedirectSignIn(win())).toBe(true);
  });

  it('bleibt ohne erst-party Handler beim Popup', () => {
    // Ohne ihn braeuchte der Redirect Third-Party-Storage und waere
    // schlechter als das Popup, nicht besser.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(shouldUseRedirectSignIn(win())).toBe(false);
  });

  it('folgt dem geraetelokalen Proxy-Schalter', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(shouldUseRedirectSignIn(win('true'))).toBe(true);
  });

  it('laesst sich mit ?signInFlow=popup zurueckdrehen', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=popup`);
    expect(shouldUseRedirectSignIn(w)).toBe(false);
  });

  it('merkt sich diese Wahl', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(shouldUseRedirectSignIn(win(null, '', 'popup'))).toBe(false);
  });

  it('nimmt ?signInFlow=redirect wieder zurueck', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=redirect`, 'popup');
    expect(shouldUseRedirectSignIn(w)).toBe(true);
  });

  it('ignoriert einen unbekannten Wert', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(
      shouldUseRedirectSignIn(win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=unsinn`)),
    ).toBe(true);
  });

  it('ist ohne Fenster (SSR) aus', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(shouldUseRedirectSignIn(undefined)).toBe(false);
  });
});
