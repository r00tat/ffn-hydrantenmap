import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_PROXY_STORAGE_KEY, type AuthProxyWindow } from './authDomain';
import {
  isIosWebKit,
  shouldUseRedirectSignIn,
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

function win(stored: string | null = null): AuthProxyWindow {
  return {
    location: { search: '', host: 'einsatz-dev.ffnd.at' },
    localStorage: {
      getItem: (key: string) =>
        key === AUTH_PROXY_STORAGE_KEY ? stored : null,
      setItem: () => {},
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
