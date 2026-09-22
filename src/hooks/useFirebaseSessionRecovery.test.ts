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
});
