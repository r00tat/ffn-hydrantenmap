import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_PROXY_STORAGE_KEY, type AuthProxyWindow } from './authDomain';
import {
  isIosWebKit,
  shouldUseRedirectSignIn,
  SIGN_IN_FLOW_QUERY_PARAM,
  SIGN_IN_FLOW_STORAGE_KEY,
  type SignInNavigator,
} from './signInStrategy';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC_SAFARI = IPAD_DESKTOP_MODE;
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function nav(userAgent: string, maxTouchPoints = 0): SignInNavigator {
  return { userAgent, maxTouchPoints };
}

function win(
  stored: string | null = null,
  search = '',
  storedFlow: string | null = null,
): AuthProxyWindow {
  const values: Record<string, string | null> = {
    [AUTH_PROXY_STORAGE_KEY]: stored,
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

describe('isIosWebKit', () => {
  it('erkennt das iPhone', () => {
    expect(isIosWebKit(nav(IPHONE_SAFARI))).toBe(true);
  });

  it('erkennt ein iPad im Desktop-Modus an den Touchpunkten', () => {
    expect(isIosWebKit(nav(IPAD_DESKTOP_MODE, 5))).toBe(true);
  });

  it('haelt einen Mac nicht faelschlich fuer ein iPad', () => {
    expect(isIosWebKit(nav(MAC_SAFARI, 0))).toBe(false);
  });

  it('erkennt Desktop-Chrome nicht als iOS', () => {
    expect(isIosWebKit(nav(DESKTOP_CHROME))).toBe(false);
  });
});

describe('shouldUseRedirectSignIn', () => {
  it('bleibt ohne erst-party Handler beim Popup, auch auf iOS', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(shouldUseRedirectSignIn(nav(IPHONE_SAFARI), win())).toBe(false);
  });

  it('nimmt auf iOS den Redirect, sobald der Handler erst-party ist', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(shouldUseRedirectSignIn(nav(IPHONE_SAFARI), win())).toBe(true);
  });

  it('laesst den Desktop beim Popup', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(shouldUseRedirectSignIn(nav(DESKTOP_CHROME), win())).toBe(false);
  });

  it('folgt dem geraetelokalen Schalter', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect(shouldUseRedirectSignIn(nav(IPHONE_SAFARI), win('true'))).toBe(true);
  });

  it('ist ohne Navigator (SSR) aus', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(shouldUseRedirectSignIn(undefined, win())).toBe(false);
  });
});

describe('shouldUseRedirectSignIn: ausdruecklich gewaehlter Ablauf', () => {
  it('erzwingt den Redirect auch auf dem Desktop', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=redirect`);
    expect(shouldUseRedirectSignIn(nav(DESKTOP_CHROME), w)).toBe(true);
  });

  it('merkt sich die Wahl fuer die naechsten Aufrufe', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=redirect`);
    shouldUseRedirectSignIn(nav(DESKTOP_CHROME), w);
    expect(w.localStorage.getItem(SIGN_IN_FLOW_STORAGE_KEY)).toBe('redirect');
  });

  it('erzwingt das Popup auch auf iOS', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=popup`);
    expect(shouldUseRedirectSignIn(nav(IPHONE_SAFARI), w)).toBe(false);
  });

  it('folgt dem gemerkten Ablauf ohne Query-Parameter', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect(
      shouldUseRedirectSignIn(nav(DESKTOP_CHROME), win(null, '', 'redirect')),
    ).toBe(true);
  });

  it('braucht trotzdem den erst-party Handler', () => {
    // Ohne ihn scheitert der Redirect an der Third-Party-Storage — ein
    // erzwungener Redirect waere dann schlechter als das Popup.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=redirect`);
    expect(shouldUseRedirectSignIn(nav(DESKTOP_CHROME), w)).toBe(false);
  });

  it('ignoriert einen unbekannten Wert', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    const w = win(null, `?${SIGN_IN_FLOW_QUERY_PARAM}=unsinn`);
    expect(shouldUseRedirectSignIn(nav(DESKTOP_CHROME), w)).toBe(false);
    expect(shouldUseRedirectSignIn(nav(IPHONE_SAFARI), w)).toBe(true);
  });
});
