// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startMock = vi.fn();

vi.mock('firebaseui', () => ({
  auth: {
    AuthUI: Object.assign(
      class {
        start = startMock;
      },
      { getInstance: () => null },
    ),
  },
}));
vi.mock('firebaseui/dist/firebaseui.css', () => ({}));
vi.mock('./firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    PROVIDER_ID: 'password',
    EMAIL_LINK_SIGN_IN_METHOD: 'emailLink',
  },
  GoogleAuthProvider: { PROVIDER_ID: 'google.com' },
  sendEmailVerification: vi.fn(),
}));

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

async function renderLogin() {
  const { default: FirebaseUiLogin } = await import('./firebase-ui-login');
  render(<FirebaseUiLogin />);
  return startMock.mock.calls.at(-1)?.[1] as { signInFlow: string };
}

beforeEach(() => {
  startMock.mockClear();
  localStorage.clear();
  // Die Komponente blendet in `uiShown` einen Ladehinweis aus.
  document.body.innerHTML = '<div id="loader"></div>';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('FirebaseUiLogin', () => {
  it('bleibt auf dem Desktop beim Popup', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    setUserAgent(DESKTOP);
    expect((await renderLogin()).signInFlow).toBe('popup');
  });

  it('bleibt auf iOS beim Popup, solange der Handler nicht erst-party ist', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    setUserAgent(IPHONE);
    expect((await renderLogin()).signInFlow).toBe('popup');
  });

  it('nimmt auf iOS den Redirect, sobald der Handler erst-party ist', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    setUserAgent(IPHONE);
    expect((await renderLogin()).signInFlow).toBe('redirect');
  });
});
