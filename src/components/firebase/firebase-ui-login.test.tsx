// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const startMock = vi.fn();

vi.mock('firebaseui', () => ({
  auth: {
    AuthUI: Object.assign(
      class {
        start = startMock;
        isPendingRedirect = () => false;
      },
      { getInstance: () => null },
    ),
  },
}));
vi.mock('firebaseui/dist/firebaseui.css', () => ({}));
vi.mock('./firebase', () => ({
  auth: {
    app: { options: { authDomain: 'localhost:3000' } },
    currentUser: null,
  },
}));
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: {
    PROVIDER_ID: 'password',
    EMAIL_LINK_SIGN_IN_METHOD: 'emailLink',
  },
  GoogleAuthProvider: { PROVIDER_ID: 'google.com' },
  onAuthStateChanged: vi.fn(() => () => {}),
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

interface UiConfig {
  signInFlow: string;
  callbacks: { signInFailure: (error: unknown) => unknown };
  signInOptions: {
    provider: string;
    customParameters?: Record<string, string>;
  }[];
}

async function renderLogin() {
  const { default: FirebaseUiLogin } = await import('./firebase-ui-login');
  renderWithIntl(<FirebaseUiLogin />);
  return startMock.mock.calls.at(-1)?.[1] as UiConfig;
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

describe('FirebaseUiLogin: gescheiterte Anmeldung', () => {
  it('zeigt den Fehler an, statt ihn nur zu protokollieren', async () => {
    // Beim Redirect-Weg kommt die Seite neu hoch; ohne sichtbare Meldung
    // saehe man nur wieder das Anmeldeformular.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    setUserAgent(IPHONE);
    const config = await renderLogin();

    config.callbacks.signInFailure({
      code: 'auth/credential-already-in-use',
      message: 'Bereits vergeben',
    });

    await waitFor(() => {
      expect(
        screen.getByText(/auth\/credential-already-in-use: Bereits vergeben/),
      ).toBeInTheDocument();
    });
  });
});

describe('FirebaseUiLogin: Kontenauswahl', () => {
  it('laesst Google immer nach dem Konto fragen', async () => {
    // Ohne `prompt` waehlt Google bei einer aktiven Sitzung stillschweigend
    // ein Konto aus. Wer zwei hat, kommt so nie an das zweite.
    const config = await renderLogin();
    const google = config.signInOptions.find(
      (o) => o.provider === 'google.com',
    );
    expect(google?.customParameters).toEqual({ prompt: 'select_account' });
  });
});
