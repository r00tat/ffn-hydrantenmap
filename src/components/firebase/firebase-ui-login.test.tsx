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
  it('nimmt bei erst-party Handler den Redirect', async () => {
    // Ohne Geraeteerkennung: Der Browser spielt keine Rolle mehr.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
    expect((await renderLogin()).signInFlow).toBe('redirect');
  });

  it('bleibt ohne erst-party Handler beim Popup', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', '');
    expect((await renderLogin()).signInFlow).toBe('popup');
  });
});

describe('FirebaseUiLogin: gescheiterte Anmeldung', () => {
  it('zeigt den Fehler an, statt ihn nur zu protokollieren', async () => {
    // Beim Redirect-Weg kommt die Seite neu hoch; ohne sichtbare Meldung
    // saehe man nur wieder das Anmeldeformular.
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_PROXY', 'true');
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
