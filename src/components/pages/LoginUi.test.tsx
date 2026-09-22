// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '../../test-utils/intlRender';

const isCapacitorNative = vi.fn(() => false);
const loginState = vi.fn(() => ({
  isSignedIn: false,
  isAuthLoading: false,
  isRefreshing: false,
  loginStep: 'idle',
}));
const isSuppressed = vi.fn(() => false);

vi.mock('../firebase/googleAuthAdapter', () => ({
  getNativeDebugInfo: () => ({ isCapacitorNative: isCapacitorNative() }),
}));
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => loginState(),
}));
vi.mock('../../hooks/auth/recoverySuppression', () => ({
  isSessionRecoverySuppressed: () => isSuppressed(),
}));
vi.mock('../../hooks/useDebugging', () => ({
  useDebugLogging: () => ({ displayMessages: false }),
}));
vi.mock('../logging/DebugLoggingSwitch', () => ({
  default: () => <div />,
}));
vi.mock('../auth/PasskeyLoginButton', () => ({
  default: () => <button>Passkey</button>,
}));
vi.mock('./ProfileUi', () => ({ default: () => <div /> }));
vi.mock('../firebase/NativeLoginPanel', () => ({
  default: () => <div data-testid="native-login" />,
}));

// `next/dynamic` laedt FirebaseUI erst im Browser nach. Im Test zaehlt nur,
// ob es ueberhaupt gerendert wird und mit welcher Anbieterwahl.
vi.mock('next/dynamic', () => ({
  default: () =>
    function FirebaseUiLoginMock({
      showGoogleProvider = true,
    }: {
      showGoogleProvider?: boolean;
    }) {
      return (
        <div data-testid="firebaseui" data-google={String(showGoogleProvider)} />
      );
    },
}));

async function renderLoginUi() {
  const { default: LoginUi } = await import('./LoginUi');
  renderWithIntl(<LoginUi />);
}

beforeEach(() => {
  isCapacitorNative.mockReturnValue(false);
  isSuppressed.mockReturnValue(false);
  loginState.mockReturnValue({
    isSignedIn: false,
    isAuthLoading: false,
    isRefreshing: false,
    loginStep: 'idle',
  });
});

describe('LoginUi', () => {
  it('zeigt im Browser FirebaseUI mit allen Anbietern', async () => {
    await renderLoginUi();
    expect(screen.queryByTestId('native-login')).not.toBeInTheDocument();
    expect(screen.getByTestId('firebaseui')).toHaveAttribute(
      'data-google',
      'true',
    );
  });

  it('zeigt in der App den nativen Login zusaetzlich zu FirebaseUI', async () => {
    // Der Android-Login ist eine Ergaenzung, kein Ersatz: E-Mail, E-Mail-Link
    // und Passkey muessen auch in der App erreichbar bleiben.
    isCapacitorNative.mockReturnValue(true);
    await renderLoginUi();
    expect(await screen.findByTestId('native-login')).toBeInTheDocument();
    expect(screen.getByTestId('firebaseui')).toHaveAttribute(
      'data-google',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Passkey' })).toBeInTheDocument();
  });

  it('meldet die laufende automatische Anmeldung, solange Firebase antwortet', async () => {
    loginState.mockReturnValue({
      isSignedIn: false,
      isAuthLoading: true,
      isRefreshing: false,
      loginStep: 'idle',
    });
    await renderLoginUi();
    expect(screen.getByText('Anmeldung läuft...')).toBeInTheDocument();
  });

  it('verspricht nach dem Abmelden keine automatische Anmeldung', async () => {
    // Nach dem Logout laedt `fbSignOut` die Seite neu, und `isAuthLoading`
    // steht wieder auf true, bis Firebase seinen leeren Zustand meldet — rund
    // eine Sekunde, in der die Seite eine Anmeldung ankuendigt, die gesperrt
    // ist und gar nicht kommt.
    isSuppressed.mockReturnValue(true);
    loginState.mockReturnValue({
      isSignedIn: false,
      isAuthLoading: true,
      isRefreshing: false,
      loginStep: 'idle',
    });
    await renderLoginUi();
    expect(screen.queryByText('Anmeldung läuft...')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Gespeicherte Anmeldung wird geladen...')
    ).not.toBeInTheDocument();
  });

  it('zeigt den Fortschritt trotz Sperre, sobald wirklich angemeldet wird', async () => {
    // Die Sperre faellt erst mit `onAuthStateChanged`. Wer sich von Hand neu
    // anmeldet, soll die Schritte sehen, nicht eine stumme Seite.
    isSuppressed.mockReturnValue(true);
    loginState.mockReturnValue({
      isSignedIn: true,
      isAuthLoading: false,
      isRefreshing: false,
      loginStep: 'verifying',
    });
    await renderLoginUi();
    expect(screen.getByText('Anmeldung läuft...')).toBeInTheDocument();
  });
});
