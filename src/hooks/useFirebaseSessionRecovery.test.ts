// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  isNativePlatformMock,
  getCurrentUserMock,
  getIdTokenMock,
  nativeSignInMock,
  signInWithCustomTokenMock,
  sessionTokenMock,
  nativeExchangeMock,
  useSessionMock,
} = vi.hoisted(() => ({
  authMock: {
    currentUser: null as unknown,
    authStateReady: vi.fn(async () => {}),
  },
  isNativePlatformMock: vi.fn(() => true),
  getCurrentUserMock: vi.fn(),
  getIdTokenMock: vi.fn(),
  nativeSignInMock: vi.fn(async () => {}),
  signInWithCustomTokenMock: vi.fn(async () => {}),
  sessionTokenMock: vi.fn(),
  nativeExchangeMock: vi.fn(),
  useSessionMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock },
}));

vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    getCurrentUser: getCurrentUserMock,
    getIdToken: getIdTokenMock,
    signInWithCustomToken: nativeSignInMock,
  },
}));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: signInWithCustomTokenMock,
}));

vi.mock('../components/firebase/firebase', () => ({ auth: authMock }));

vi.mock('../app/actions/auth', () => ({
  createFirebaseTokenForSession: sessionTokenMock,
  exchangeNativeIdTokenForFirebaseToken: nativeExchangeMock,
}));

vi.mock('next-auth/react', () => ({ useSession: useSessionMock }));

/**
 * Die Unterdrueckung beim Abmelden haengt an einem Modul-Flag, das kein
 * Zuruecksetzen kennt — also holen wir das Modul je Test frisch.
 */
async function loadHook() {
  vi.resetModules();
  return await import('./useFirebaseSessionRecovery');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  authMock.currentUser = null;
  isNativePlatformMock.mockReturnValue(true);
  useSessionMock.mockReturnValue({ status: 'authenticated' });
  getCurrentUserMock.mockResolvedValue({ user: { uid: 'native-uid' } });
  getIdTokenMock.mockResolvedValue({ token: 'native-id-token' });
  nativeExchangeMock.mockResolvedValue({ token: 'custom-from-native' });
  sessionTokenMock.mockResolvedValue({ token: 'custom-from-session' });
});

describe('useFirebaseSessionRecovery', () => {
  it('meldet den Client mit der nativen Sitzung an', async () => {
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() =>
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(
        authMock,
        'custom-from-native'
      )
    );
    expect(nativeExchangeMock).toHaveBeenCalledWith('native-id-token');
    // Die native Sitzung steht schon — ein Umweg ueber den Server waere ein
    // zweiter Rundlauf ohne Gewinn.
    expect(sessionTokenMock).not.toHaveBeenCalled();
    expect(nativeSignInMock).not.toHaveBeenCalled();
  });

  it('nutzt die native Sitzung auch ohne gueltiges Cookie', async () => {
    // Genau der Fall, in dem der Weg ueber die Session nicht mehr traegt:
    // das NextAuth-Cookie ist abgelaufen, die native Anmeldung steht noch.
    useSessionMock.mockReturnValue({ status: 'unauthenticated' });
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() =>
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(
        authMock,
        'custom-from-native'
      )
    );
    expect(sessionTokenMock).not.toHaveBeenCalled();
  });

  it('faellt auf die NextAuth-Session zurueck, wenn nativ nichts liegt', async () => {
    getCurrentUserMock.mockResolvedValue({ user: null });
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() =>
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(
        authMock,
        'custom-from-session'
      )
    );
    expect(nativeExchangeMock).not.toHaveBeenCalled();
    // Ohne native Sitzung muessen die nativen Dienste (Live-Standort,
    // Radiacode) nachgezogen werden, sonst schreiben sie ohne `request.auth`.
    await waitFor(() =>
      expect(nativeSignInMock).toHaveBeenCalledWith({
        token: 'custom-from-session',
        skipNativeAuth: false,
      })
    );
  });

  it('faellt auf die Session zurueck, wenn der Tausch abgelehnt wird', async () => {
    nativeExchangeMock.mockResolvedValue({ error: 'Invalid token' });
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() =>
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(
        authMock,
        'custom-from-session'
      )
    );
  });

  it('fragt im Browser gar nicht erst nativ nach', async () => {
    isNativePlatformMock.mockReturnValue(false);
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() => expect(signInWithCustomTokenMock).toHaveBeenCalled());
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(nativeSignInMock).not.toHaveBeenCalled();
  });

  it('ruehrt nichts an, wenn der Client schon einen Benutzer hat', async () => {
    authMock.currentUser = { uid: 'already-here' };
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await Promise.resolve();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(sessionTokenMock).not.toHaveBeenCalled();
    expect(signInWithCustomTokenMock).not.toHaveBeenCalled();
  });

  it('wartet ab, solange NextAuth seinen Zustand noch nicht kennt', async () => {
    useSessionMock.mockReturnValue({ status: 'loading' });
    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await Promise.resolve();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it('versucht es genau einmal je Seitenaufbau', async () => {
    nativeExchangeMock.mockResolvedValue({ error: 'Invalid token' });
    sessionTokenMock.mockResolvedValue({ error: 'no user id in session' });
    const { useFirebaseSessionRecovery } = await loadHook();
    const { rerender } = renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() => expect(sessionTokenMock).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    await Promise.resolve();
    expect(sessionTokenMock).toHaveBeenCalledTimes(1);
  });

  it('schweigt, wenn das Abmelden die Wiederherstellung sperrt', async () => {
    const { useFirebaseSessionRecovery, suppressSessionRecovery } =
      await loadHook();
    suppressSessionRecovery();
    renderHook(() => useFirebaseSessionRecovery());

    await Promise.resolve();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(signInWithCustomTokenMock).not.toHaveBeenCalled();
  });

  it('bleibt gesperrt ueber den Reload, den das Abmelden ausloest', async () => {
    // `fbSignOut` schliesst mit `window.location.assign('/login')` ab. Damit
    // faellt das Modul samt seiner Sperre weg — und der Hook lief auf der
    // neuen Seite sofort wieder an. Steht eine native Sitzung, holt er den
    // gerade Abgemeldeten daraus zurueck.
    const { suppressSessionRecovery } = await loadHook();
    suppressSessionRecovery();

    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await Promise.resolve();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
    expect(signInWithCustomTokenMock).not.toHaveBeenCalled();
  });

  it('bleibt auch ueber einen App-Neustart hinweg gesperrt', async () => {
    // Der Fall, den der Reload allein nicht abdeckt: scheitert der native
    // `signOut`, ueberlebt die Firebase-Sitzung im nativen SDK das Abmelden.
    // Ohne dauerhafte Sperre brauchte es dann nur einen Neustart, und die
    // Bruecke meldet den Benutzer wieder an.
    const { suppressSessionRecovery } = await loadHook();
    suppressSessionRecovery();

    // Ein Neustart nimmt die Sitzungsablage mit, den dauerhaften Speicher
    // nicht.
    window.sessionStorage.clear();

    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await Promise.resolve();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it('hebt die Sperre beim naechsten erfolgreichen Login wieder auf', async () => {
    const first = await loadHook();
    first.suppressSessionRecovery();
    first.clearSessionRecoverySuppression();

    const { useFirebaseSessionRecovery } = await loadHook();
    renderHook(() => useFirebaseSessionRecovery());

    await waitFor(() =>
      expect(signInWithCustomTokenMock).toHaveBeenCalledWith(
        authMock,
        'custom-from-native'
      )
    );
  });

  it('arbeitet weiter, wenn der Browserspeicher jeden Zugriff verweigert', async () => {
    // Privater Modus, geloeschte Site-Daten: `localStorage` wirft dann schon
    // beim Lesen. Die Sperre ist dann nur so gut wie das Modul-Flag, aber die
    // Wiederherstellung darf daran nicht scheitern.
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    try {
      const { useFirebaseSessionRecovery } = await loadHook();
      renderHook(() => useFirebaseSessionRecovery());

      await waitFor(() => expect(signInWithCustomTokenMock).toHaveBeenCalled());
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });
});
