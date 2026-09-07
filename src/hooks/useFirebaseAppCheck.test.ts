// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const initializeAppCheckMock = vi.hoisted(() => vi.fn());
const reCaptchaEnterpriseProviderMock = vi.hoisted(() =>
  vi.fn(function ReCaptchaEnterpriseProvider(
    this: { siteKey: string },
    siteKey: string
  ) {
    this.siteKey = siteKey;
  })
);

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: initializeAppCheckMock,
  ReCaptchaEnterpriseProvider: reCaptchaEnterpriseProviderMock,
}));

vi.mock('../components/firebase/firebase', () => ({
  firebaseApp: { name: 'test-app' },
}));

/**
 * The debug flag has to be set on `window` *before* `initializeAppCheck` runs,
 * otherwise the SDK already decided to talk to reCAPTCHA. The mock records the
 * value at call time so the ordering can be asserted.
 */
let debugTokenAtInit: boolean | string | undefined;

/**
 * The hook remembers across re-mounts that it already initialized App Check,
 * so every test needs a fresh copy of the module — hence the dynamic import
 * after `vi.resetModules()` instead of a static one at the top of the file.
 */
let useFirebaseAppCheck: () => void;

describe('useFirebaseAppCheck', () => {
  beforeEach(async () => {
    initializeAppCheckMock.mockReset();
    initializeAppCheckMock.mockImplementation(() => {
      debugTokenAtInit = window.FIREBASE_APPCHECK_DEBUG_TOKEN;
      return { name: 'app-check' };
    });
    reCaptchaEnterpriseProviderMock.mockClear();
    debugTokenAtInit = undefined;
    delete window.FIREBASE_APPCHECK_DEBUG_TOKEN;
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN', '');

    vi.resetModules();
    useFirebaseAppCheck = (await import('./useFirebaseAppCheck')).default;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not initialize App Check without a reCAPTCHA site key', () => {
    renderHook(() => useFirebaseAppCheck());

    expect(initializeAppCheckMock).not.toHaveBeenCalled();
  });

  it('initializes App Check with the reCAPTCHA Enterprise provider', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', 'site-key-123');

    renderHook(() => useFirebaseAppCheck());

    expect(reCaptchaEnterpriseProviderMock).toHaveBeenCalledWith(
      'site-key-123'
    );
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
    expect(initializeAppCheckMock.mock.calls[0][1]).toMatchObject({
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('does not enable the debug provider when no debug token is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', 'site-key-123');

    renderHook(() => useFirebaseAppCheck());

    expect(debugTokenAtInit).toBeUndefined();
  });

  it('requests a fresh debug token when the debug token is "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', 'site-key-123');
    vi.stubEnv('NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN', 'true');

    renderHook(() => useFirebaseAppCheck());

    expect(debugTokenAtInit).toBe(true);
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
  });

  it('reuses a registered debug token when one is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', 'site-key-123');
    vi.stubEnv(
      'NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN',
      '11111111-2222-3333-4444-555555555555'
    );

    renderHook(() => useFirebaseAppCheck());

    expect(debugTokenAtInit).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('enables the debug provider even without a reCAPTCHA site key', () => {
    vi.stubEnv('NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN', 'true');

    renderHook(() => useFirebaseAppCheck());

    expect(debugTokenAtInit).toBe(true);
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
    expect(reCaptchaEnterpriseProviderMock).toHaveBeenCalledWith('');
  });

  /**
   * App Check is load-bearing once enforcement is on, but a failure to
   * initialize it must not take the whole app down: `AppProviders` wraps every
   * page, so an exception escaping this hook would blank the screen mid
   * operation. Firestore rules and server-side auth still gate every request.
   */
  it('survives an initialization failure instead of tearing down the app', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', 'site-key-123');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    initializeAppCheckMock.mockImplementation(() => {
      throw new Error('recaptcha script blocked');
    });

    expect(() => renderHook(() => useFirebaseAppCheck())).not.toThrow();
  });

  /**
   * React runs effects twice in StrictMode and again on every fast refresh.
   * `initializeAppCheck` rejects a second call with different options for the
   * same app, so the hook has to remember that it already ran.
   */
  it('initializes App Check only once across re-mounts', () => {
    vi.stubEnv('NEXT_PUBLIC_RECAPTCHA_KEY', 'site-key-123');

    renderHook(() => useFirebaseAppCheck()).unmount();
    renderHook(() => useFirebaseAppCheck());

    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
  });
});
