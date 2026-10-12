'use client';

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { signOut as signOutJsClient, useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firebaseTokenLogin } from '../app/firebaseAuth';
import { getMyGroupsFromServer } from '../app/groups/GroupAction';
import { Group } from '../app/groups/groupTypes';
import { uniqueArray } from '../common/arrayUtils';
import { auth, firestore } from '../components/firebase/firebase';
import { USER_COLLECTION_ID } from '../components/firebase/firestore';
import { isOffline, onReconnect } from '../lib/connectivity';
import { withTimeout } from '../lib/withTimeout';
import { AuthState, LoginData, LoginStatus } from './auth/types';
import {
  refreshTokenUntilClaimsMatch,
  refreshTokenWithRetry,
} from './auth/tokenRefresh';
import {
  clearAuthFromSessionStorage,
  loadAuthFromSessionStorage,
  saveAuthToSessionStorage,
} from './auth/sessionStorage';
import { ensureFreshAuth } from './auth/ensureFreshAuth';
import {
  clearSessionRecoverySuppression,
  suppressSessionRecovery,
} from './auth/recoverySuppression';
import {
  OfflineAuthSnapshot,
  clearOfflineAuth,
  loadOfflineAuth,
  saveOfflineAuth,
} from './auth/offlineAuthCache';

// Re-export types for backward compatibility
export type { LoginData, LoginStatus, LoginStep } from './auth/types';

function nonNull(value: any) {
  return value !== null ? value : undefined;
}

/**
 * So lange darf die Anmeldung am Server dauern, bevor die App auf den
 * Zwischenspeicher der letzten Anmeldung umschaltet. Gilt nur, wenn es einen
 * gibt; ohne ihn wird wie bisher abgewartet. Die Anmeldung läuft danach weiter
 * und übernimmt, sobald sie doch noch antwortet.
 */
export const OFFLINE_LOGIN_TIMEOUT_MS = 8_000;
/** Höchstwartezeit für `getMyGroupsFromServer`, danach gilt der Zwischenspeicher. */
export const SERVER_GROUPS_TIMEOUT_MS = 8_000;
/**
 * Scheitert die Anmeldung am Server, obwohl er erreichbar ist (etwa ein
 * vorübergehender Fehler beim Token-Refresh), wird sie nach dieser Zeit
 * wiederholt. Ohne Wechsel auf „nicht erreichbar" gäbe es sonst keinen
 * Auslöser bis zum Neuladen.
 */
export const LOGIN_RETRY_MS = 30_000;

/** Rechte aus dem Zwischenspeicher als Teil des Anmeldezustands. */
function offlineAuthState(cached: OfflineAuthSnapshot): Partial<LoginData> {
  return {
    isSignedIn: true,
    isAuthorized: cached.isAuthorized,
    isAdmin: cached.isAdmin,
    groups: cached.groups,
    groupAdmin: cached.groupAdmin,
    fahrtenbuchGeraetemeister: cached.fahrtenbuchGeraetemeister,
    bekleidungswart: cached.bekleidungswart,
    firecall: cached.firecall,
    firecallWrite: cached.firecallWrite,
    email: cached.email,
    displayName: cached.displayName,
    photoURL: cached.photoURL,
    uid: cached.uid,
    offlineAuth: true,
    authSource: 'offlineCache',
  };
}

function getInitialLoginStatus(): LoginData {
  // Kaltstart ohne Netz: Der Browser meldet selbst „offline", also wird der
  // Server ohnehin nicht antworten. Statt den Login-Bildschirm aufblitzen zu
  // lassen, bis Firebase Auth den Benutzer aus IndexedDB geladen hat, gilt
  // vorläufig der Zwischenspeicher. `hasFirebaseUser` bleibt false, bis
  // `onAuthStateChanged` denselben Benutzer bestätigt (siehe dort).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offline = loadOfflineAuth();
    if (offline) {
      return {
        ...offlineAuthState(offline),
        isAuthorized: offline.isAuthorized,
        isAdmin: offline.isAdmin,
        isSignedIn: true,
        isAuthLoading: false,
        hasFirebaseUser: false,
        isRefreshing: true,
        myGroups: offline.myGroups,
        loginStep: 'done',
      };
    }
  }
  const cachedAuth = loadAuthFromSessionStorage();
  if (cachedAuth) {
    // `hasFirebaseUser` bewusst hart auf false: der Cache lässt die App sofort
    // in ihrer angemeldeten Form rendern, aber Firebase Auth hat zu diesem
    // Zeitpunkt noch keinen Benutzer. Erst onAuthStateChanged setzt das Flag.
    return {
      ...cachedAuth,
      // Stammt aus einem früheren Lauf — die Anmeldung dieses Laufs steht aus.
      authSource: undefined,
      hasFirebaseUser: false,
      isRefreshing: true,
      isAuthLoading: false,
      loginStep: 'done',
    };
  }
  return {
    isSignedIn: false,
    isAuthorized: false,
    isAdmin: false,
    isAuthLoading: true,
    hasFirebaseUser: false,
    myGroups: [],
    loginStep: 'idle',
  };
}

export default function useFirebaseLoginObserver(): LoginStatus {
  const { data: session, status: sessionStatus } = useSession();

  const [loginStatus, setLoginStatus] = useState<LoginData>(getInitialLoginStatus);
  const [uid, setUid] = useState<string>();
  const [myGroups, setMyGroups] = useState<Group[]>(
    () => getInitialLoginStatus().myGroups ?? []
  );
  const [needsReLogin, setNeedsReLogin] = useState(false);
  const [credentialsRefreshed, setCredentialsRefreshed] = useState(false);
  const lastKnownAuthRef = useRef<AuthState | null>(null);
  // Track when the last server login happened to avoid unnecessary refreshes
  const lastRefreshRef = useRef<number>(0);
  /** Woher die aktuellen Rechte stammen: Server oder Zwischenspeicher. */
  const authSourceRef = useRef<'server' | 'offlineCache' | null>(null);
  const sessionStatusRef = useRef(sessionStatus);
  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  // Derive auth state from session when available (faster initial load)
  const hasSessionAuth = sessionStatus === 'authenticated' && session?.user;
  const derivedIsAuthorized = hasSessionAuth
    ? (session.user.isAuthorized ?? loginStatus.isAuthorized)
    : loginStatus.isAuthorized;
  const derivedIsAdmin = hasSessionAuth
    ? (session.user.isAdmin ?? loginStatus.isAdmin)
    : loginStatus.isAdmin;
  const derivedGroups = hasSessionAuth
    ? (session.user.groups ?? loginStatus.groups)
    : loginStatus.groups;
  const derivedFirecall = hasSessionAuth
    ? (session.user.firecall ?? loginStatus.firecall)
    : loginStatus.firecall;
  const derivedFirecallWrite = hasSessionAuth
    ? (session.user.firecallWrite ?? loginStatus.firecallWrite)
    : loginStatus.firecallWrite;
  const derivedGeraetemeister = hasSessionAuth
    ? (session.user.fahrtenbuchGeraetemeister ??
      loginStatus.fahrtenbuchGeraetemeister)
    : loginStatus.fahrtenbuchGeraetemeister;
  const derivedBekleidungswart = hasSessionAuth
    ? (session.user.bekleidungswart ?? loginStatus.bekleidungswart)
    : loginStatus.bekleidungswart;
  // Wie der Gerätemeister: Die Rolle steht nur in der Session, nicht in den
  // Token-Claims — der Firestore-Fallback unten kennt sie deshalb nicht.
  const derivedGroupAdmin = hasSessionAuth
    ? (session.user.groupAdmin ?? loginStatus.groupAdmin)
    : loginStatus.groupAdmin;

  const serverLogin = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      await firebaseTokenLogin(token);
    } else {
      console.warn(`server login: no token available`);
    }
  }, []);

  const refresh = useCallback(async (refreshUid?: string) => {
    // Allow caller (e.g. onAuthStateChanged) to pass uid directly to bypass
    // a React state race: setUid triggers a render, but if all subsequent
    // awaits resolve from cache (Firebase token), React may not commit before
    // refresh runs — leaving the captured `uid` from this closure stale.
    const effectiveUid = refreshUid ?? uid;
    if (!effectiveUid) return;

    try {
      // Mit Zeitgrenze: Im WLAN ohne Internet hinge die Server Action, bis der
      // Browser aufgibt. Ohne Antwort gelten die zuletzt bekannten Gruppen.
      const groups = await withTimeout(
        getMyGroupsFromServer(),
        SERVER_GROUPS_TIMEOUT_MS,
        'getMyGroupsFromServer'
      ).catch((err) => {
        console.error('getMyGroupsFromServer failed:', err);
        return loadOfflineAuth(effectiveUid)?.myGroups ?? ([] as Group[]);
      });
      setMyGroups(groups);

      const hasSessionData = session?.user?.isAuthorized !== undefined;

      if (hasSessionData) {
        await handleSessionBasedRefresh(
          session,
          setNeedsReLogin,
          setCredentialsRefreshed,
          serverLogin
        );
        setLoginStatus((prev) => ({
          ...prev,
          isAuthorized: session.user.isAuthorized,
          isAdmin: session.user.isAdmin,
          groups: session.user.groups,
          firecall: session.user.firecall,
          firecallWrite: session.user.firecallWrite,
          // Auch die Rollen, die nur in der Sitzung stehen: Antwortet die
          // Sitzung später nicht mehr (offline), bleiben sie so erhalten.
          groupAdmin: session.user.groupAdmin,
          fahrtenbuchGeraetemeister: session.user.fahrtenbuchGeraetemeister,
          bekleidungswart: session.user.bekleidungswart,
          isRefreshing: false,
        }));
      } else {
        await handleFirestoreBasedRefresh(
          effectiveUid,
          setNeedsReLogin,
          setLoginStatus
        );
      }
    } catch (err) {
      console.error(`failed to refresh user data`, err);
      setLoginStatus((prev) => ({ ...prev, isRefreshing: false }));
    }
  }, [uid, session, serverLogin]);

  // Refs to avoid recreating handlers
  const refreshRef = useRef(refresh);
  const serverLoginRef = useRef(serverLogin);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => {
    serverLoginRef.current = serverLogin;
  }, [serverLogin]);

  /**
   * Rechte aus dem Zwischenspeicher übernehmen, weil der Server nicht
   * antwortet. `hasFirebaseUser` ist hier echt: Firebase Auth hat den
   * Benutzer aus IndexedDB geladen, auch wenn sein ID-Token abgelaufen ist.
   * Firestore liest dann aus dem Cache und reiht Schreibvorgänge ein.
   */
  const applyOfflineAuth = useCallback(
    (user: User, cached: OfflineAuthSnapshot) => {
      console.info(
        `server not reachable, using the cached login from ${new Date(cached.savedAt).toISOString()}`
      );
      authSourceRef.current = 'offlineCache';
      setMyGroups(cached.myGroups);
      setLoginStatus((prev) => ({
        ...prev,
        ...offlineAuthState(cached),
        isAuthLoading: false,
        hasFirebaseUser: true,
        user,
        email: nonNull(user.email) ?? cached.email,
        displayName: nonNull(user.displayName) ?? cached.displayName,
        photoURL: nonNull(user.photoURL) ?? cached.photoURL,
        uid: user.uid,
        isRefreshing: false,
        loginStep: 'done',
      }));
    },
    []
  );

  /**
   * Anmeldung am Server: ID-Token, NextAuth-Sitzung, Claims.
   *
   * Offline scheitert das (abgelaufenes Token ohne Netz) oder hängt (WLAN ohne
   * Internet). Gibt es einen Zwischenspeicher für diesen Benutzer, gilt er —
   * sofort, wenn die App schon weiß, dass sie offline ist, sonst nach
   * `OFFLINE_LOGIN_TIMEOUT_MS` oder beim Fehlschlag. Antwortet der Server doch
   * noch, übernimmt er.
   */
  const loginRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => () => clearTimeout(loginRetryTimerRef.current), []);

  const completeLogin = useCallback(
    async (user: User) => {
      clearTimeout(loginRetryTimerRef.current);
      const cached = loadOfflineAuth(user.uid);
      let settled = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      if (cached && isOffline()) {
        applyOfflineAuth(user, cached);
      } else {
        setLoginStatus((prev) => ({ ...prev, loginStep: 'authenticating' }));
        if (cached) {
          fallbackTimer = setTimeout(() => {
            if (!settled) applyOfflineAuth(user, cached);
          }, OFFLINE_LOGIN_TIMEOUT_MS);
        }
      }

      try {
        const authData = await serverLoginSteps(user, {
          hasValidSession: () => sessionStatusRef.current === 'authenticated',
          serverLogin: () => serverLoginRef.current(),
          markServerLogin: () => {
            lastRefreshRef.current = Date.now();
          },
          setLoginStep: (loginStep) =>
            setLoginStatus((prev) => ({ ...prev, loginStep })),
        });
        settled = true;
        clearTimeout(fallbackTimer);
        authSourceRef.current = 'server';
        setLoginStatus((prev) => ({
          ...prev,
          ...authData,
          offlineAuth: false,
          authSource: 'server',
        }));
        await refreshRef.current(user.uid);
        setLoginStatus((prev) => ({ ...prev, loginStep: 'done' }));
        console.info(`login completed for ${user.email}`);
      } catch (err) {
        settled = true;
        clearTimeout(fallbackTimer);
        console.warn('login at the server failed', err);
        if (cached) {
          applyOfflineAuth(user, cached);
          // Der Server ist erreichbar, die Anmeldung trotzdem gescheitert: Ein
          // Reconnect kommt dann nie, also selbst noch einmal versuchen.
          if (!isOffline()) {
            loginRetryTimerRef.current = setTimeout(() => {
              if (
                authSourceRef.current === 'offlineCache' &&
                auth.currentUser?.uid === user.uid &&
                !isOffline()
              ) {
                void completeLoginRef.current(user);
              }
            }, LOGIN_RETRY_MS);
          }
        } else {
          authSourceRef.current = null;
          const provisional = loadOfflineAuth();
          if (provisional && provisional.uid !== user.uid) setMyGroups([]);
          // Ohne Zwischenspeicher bleibt es beim Login-Bildschirm, aber nicht
          // bei einem endlosen Ladezustand.
          setLoginStatus((prev) => ({
            ...prev,
            // Die vorläufige Anzeige kann einem anderen Benutzer gehören
            // (Zwischenspeicher ohne UID beim Kaltstart) — dessen Rechte
            // dürfen nicht stehen bleiben.
            ...(prev.offlineAuth || prev.uid !== user.uid
              ? {
                  isAuthorized: false,
                  isAdmin: false,
                  groups: [],
                  groupAdmin: undefined,
                  fahrtenbuchGeraetemeister: undefined,
                  bekleidungswart: undefined,
                  firecall: undefined,
                  firecallWrite: undefined,
                  myGroups: [],
                  offlineAuth: false,
                }
              : {}),
            authSource: undefined,
            isSignedIn: true,
            isAuthLoading: false,
            hasFirebaseUser: true,
            user,
            uid: user.uid,
            email: nonNull(user.email),
            displayName: nonNull(user.displayName),
            photoURL: nonNull(user.photoURL),
            isRefreshing: false,
            loginStep: 'done',
          }));
        }
      }
    },
    [applyOfflineAuth]
  );
  const completeLoginRef = useRef(completeLogin);
  useEffect(() => {
    completeLoginRef.current = completeLogin;
  }, [completeLogin]);

  // Firebase Auth state listener
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged(
      async (user: User | null) => {
        const u: User | undefined = user != null ? user : undefined;
        setUid(u?.uid);

        if (user) {
          // Eine Anmeldung hebt die Sperre auf, die das Abmelden gesetzt hat —
          // sie kennt keinen Zeitablauf, nur diesen einen Weg zurueck.
          clearSessionRecoverySuppression();
          await completeLoginRef.current(user);
        } else {
          // Eine vorläufig aus dem Zwischenspeicher übernommene Anzeige
          // (Kaltstart, siehe getInitialLoginStatus) muss weg. Den Speicher
          // selbst lässt das stehen: Er gilt nur für einen Firebase-Benutzer
          // mit derselben UID, und unter Android kommt die WebView anfangs
          // ohne Benutzer hoch, bis die Sitzungs-Wiederherstellung greift.
          // Gelöscht wird er beim Abmelden.
          authSourceRef.current = null;
          setLoginStatus((prev) => ({
            ...prev,
            ...(prev.offlineAuth
              ? {
                  isAuthorized: false,
                  isAdmin: false,
                  groups: [],
                  groupAdmin: undefined,
                  fahrtenbuchGeraetemeister: undefined,
                  bekleidungswart: undefined,
                  offlineAuth: false,
                }
              : {}),
            authSource: undefined,
            isSignedIn: false,
            isAuthLoading: false,
            hasFirebaseUser: false,
            user: undefined,
            loginStep: 'idle',
          }));
        }
      }
    );
    return () => unregisterAuthObserver();
  }, []);

  // Zurück online, aber die Rechte stammen aus dem Zwischenspeicher: die
  // Anmeldung am Server nachholen, damit wieder dessen Prüfung gilt.
  useEffect(
    () =>
      onReconnect(() => {
        const user = auth.currentUser;
        if (user && authSourceRef.current === 'offlineCache') {
          void completeLoginRef.current(user);
        }
      }),
    []
  );

  // Save to session storage when auth changes
  useEffect(() => {
    saveAuthToSessionStorage(loginStatus);
  }, [loginStatus]);

  // Zwischenspeicher für den Kaltstart ohne Netz erneuern — nur, wenn der
  // Server die Anmeldung gerade bestätigt hat: die NextAuth-Sitzung gehört zu
  // genau diesem Firebase-Benutzer. Aus dem Zwischenspeicher selbst wird nie
  // zurückgeschrieben, sonst verlängerte sich die Frist offline von selbst.
  const sessionUser = hasSessionAuth ? session.user : undefined;
  useEffect(() => {
    if (!sessionUser || loginStatus.offlineAuth) return;
    if (!loginStatus.hasFirebaseUser || loginStatus.isRefreshing) return;
    if (!loginStatus.uid || sessionUser.id !== loginStatus.uid) return;
    saveOfflineAuth({
      uid: loginStatus.uid,
      email: loginStatus.email,
      displayName: loginStatus.displayName,
      photoURL: loginStatus.photoURL,
      isAuthorized: !!derivedIsAuthorized,
      isAdmin: !!derivedIsAdmin,
      groups: derivedGroups ?? [],
      groupAdmin: derivedGroupAdmin,
      fahrtenbuchGeraetemeister: derivedGeraetemeister,
      bekleidungswart: derivedBekleidungswart,
      firecall: derivedFirecall,
      firecallWrite: derivedFirecallWrite,
      expiresAt: sessionUser.firecallExpiresAt,
      myGroups,
    });
  }, [
    sessionUser,
    loginStatus.offlineAuth,
    loginStatus.hasFirebaseUser,
    loginStatus.isRefreshing,
    loginStatus.uid,
    loginStatus.email,
    loginStatus.displayName,
    loginStatus.photoURL,
    derivedIsAuthorized,
    derivedIsAdmin,
    derivedGroups,
    derivedGroupAdmin,
    derivedGeraetemeister,
    derivedBekleidungswart,
    derivedFirecall,
    derivedFirecallWrite,
    myGroups,
  ]);

  // Periodic session refresh (every 30 minutes)
  useEffect(() => {
    const clearServerInterval = setInterval(() => {
      serverLogin();
      lastRefreshRef.current = Date.now();
    }, 1000 * 60 * 30);
    return () => clearInterval(clearServerInterval);
  }, [serverLogin]);

  // Refresh session when the app wakes up (tab visible, window focused,
  // page shown from bfcache, or network reconnected). Device standby pauses
  // JS timers, so any of these is the first signal that we are back and
  // should verify that the Firebase token + NextAuth session are still fresh.
  useEffect(() => {
    const SESSION_STALE_MS = 60 * 1000;
    let isRunning = false;

    const maybeRefresh = async (reason: string, force = false) => {
      if (!auth.currentUser) return;
      if (isRunning) return;
      const elapsed = Date.now() - lastRefreshRef.current;
      if (!force && elapsed < SESSION_STALE_MS) return;
      isRunning = true;
      try {
        console.info(
          `${reason}, refreshing session (last refresh ${Math.round(elapsed / 1000)}s ago)`
        );
        const ok = await ensureFreshAuth(true);
        if (ok) {
          lastRefreshRef.current = Date.now();
        } else {
          console.warn(`session refresh failed after ${reason}`);
        }
      } finally {
        isRunning = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void maybeRefresh('tab became visible');
      }
    };
    const handleFocus = () => void maybeRefresh('window focused');
    const handlePageShow = (event: PageTransitionEvent) =>
      void maybeRefresh('page shown', event.persisted);
    const handleOnline = () => void maybeRefresh('network back online', true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const fbSignOut = useCallback(async () => {
    // Vor dem Abmelden: Sonst haelt die Sitzungs-Wiederherstellung das
    // Zeitfenster, in dem der Firebase-Benutzer schon weg und das Cookie noch
    // da ist, fuer einen Ausfall und meldet den Benutzer wieder an.
    suppressSessionRecovery();
    clearAuthFromSessionStorage();
    // Nach dem Abmelden darf auch ein Kaltstart ohne Netz niemanden mehr
    // hereinlassen.
    clearOfflineAuth();
    // redirect: false — NextAuth server otherwise falls back to NEXTAUTH_URL
    // when the callbackUrl origin doesn't match (Capacitor WebView, dev
    // tunnels), which sends users to localhost.
    await signOutJsClient({ redirect: false });
    await auth.signOut();
    if (Capacitor.isNativePlatform()) {
      // Keine blosse Warnung mehr: bleibt die native Sitzung stehen, ist der
      // Benutzer nicht abgemeldet — sie ueberlebt Reload und App-Neustart, und
      // `useFirebaseSessionRecovery` koennte den Firebase-Login daraus
      // zurueckholen. Genau davor schuetzt die dauerhafte Sperre oben; hier
      // muss der Fehlschlag wenigstens sichtbar werden.
      try {
        await FirebaseAuthentication.signOut();
      } catch (firstErr) {
        console.warn('native firebase signOut failed, retrying', firstErr);
        try {
          await FirebaseAuthentication.signOut();
        } catch (err) {
          console.error(
            'logout incomplete: the native firebase session is still signed in',
            err
          );
        }
      }
    }
    console.info(`logout completed`);
    if (typeof window !== 'undefined') {
      // Bewusst ein harter Reload statt router.push(): nach dem Logout muss der
      // gesamte In-Memory-State (Firebase-Listener, NextAuth-Session, Provider)
      // verworfen werden, was eine Client-seitige Navigation nicht leistet.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    }
  }, []);

  const clearCredentialsRefreshed = useCallback(() => {
    setCredentialsRefreshed(false);
  }, []);

  // Real-time listener for user document changes (admin updates)
  useEffect(() => {
    if (!uid) {
      lastKnownAuthRef.current = null;
      return;
    }

    const userDocRef = doc(firestore, USER_COLLECTION_ID, uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      async (snapshot) => {
        const userData = snapshot.data();
        if (!userData) return;

        const currentAuth: AuthState = {
          authorized: !!userData.authorized,
          groups: [...(userData.groups || [])].sort(),
        };

        // On first snapshot, just store the initial state
        if (lastKnownAuthRef.current === null) {
          lastKnownAuthRef.current = currentAuth;
          return;
        }

        // Check if authorization fields changed
        const prevAuth = lastKnownAuthRef.current;
        const authChanged =
          currentAuth.authorized !== prevAuth.authorized ||
          JSON.stringify(currentAuth.groups) !== JSON.stringify(prevAuth.groups?.sort());

        if (authChanged && auth.currentUser) {
          console.info(`credentials changed by admin, refreshing token and session`);
          lastKnownAuthRef.current = currentAuth;

          // Immediately update UI with Firestore snapshot data
          setLoginStatus((prev) => ({
            ...prev,
            isAuthorized: currentAuth.authorized ?? prev.isAuthorized,
            groups: currentAuth.groups ?? prev.groups,
          }));
          setCredentialsRefreshed(true);
          setNeedsReLogin(false);

          // Background: refresh token and server session (non-blocking)
          (async () => {
            try {
              const refreshed = await refreshTokenWithRetry(
                currentAuth.authorized!,
                currentAuth.groups!
              );
              if (refreshed) {
                await serverLogin();
                await refresh();
              } else {
                console.warn('token claims still differ after background refresh');
                setNeedsReLogin(true);
              }
            } catch (err) {
              console.error('failed to refresh credentials after admin update', err);
              setNeedsReLogin(true);
            }
          })();
        }
      },
      (error) => {
        console.error(`user document listener error`, error);
      }
    );

    return () => unsubscribe();
  }, [uid, serverLogin, refresh]);

  return {
    ...loginStatus,
    isAuthorized: derivedIsAuthorized,
    isAdmin: derivedIsAdmin,
    groups: derivedGroups,
    firecall: derivedFirecall,
    firecallWrite: derivedFirecallWrite,
    fahrtenbuchGeraetemeister: derivedGeraetemeister,
    bekleidungswart: derivedBekleidungswart,
    groupAdmin: derivedGroupAdmin,
    myGroups,
    refresh,
    signOut: fbSignOut,
    needsReLogin,
    credentialsRefreshed,
    clearCredentialsRefreshed,
  };
}

// Helper functions to reduce complexity in the main hook

interface ServerLoginDeps {
  hasValidSession: () => boolean;
  serverLogin: () => Promise<void>;
  markServerLogin: () => void;
  setLoginStep: (step: LoginData['loginStep']) => void;
}

/**
 * ID-Token holen, falls nötig die NextAuth-Sitzung anlegen und die Claims
 * lesen. Braucht ein abgelaufenes Token oder eine fehlende Sitzung den Server,
 * scheitert oder hängt das offline — der Aufrufer fängt beides ab.
 */
async function serverLoginSteps(
  user: User,
  deps: ServerLoginDeps
): Promise<Partial<LoginData>> {
  const token = await user.getIdToken();
  if (token && !deps.hasValidSession()) {
    deps.setLoginStep('verifying');
    await deps.serverLogin();
    deps.markServerLogin();
    // Force-refresh token only on fresh login
    await user.getIdToken(true);
  }

  const tokenResult = await user.getIdTokenResult();
  const idToken = await user.getIdToken();

  return {
    isSignedIn: true,
    isAuthLoading: false,
    hasFirebaseUser: true,
    user,
    email: nonNull(user.email),
    displayName: nonNull(user.displayName),
    uid: nonNull(user.uid),
    photoURL: nonNull(user.photoURL),
    expiration: tokenResult?.expirationTime,
    idToken,
    groups: (tokenResult?.claims?.groups as string[]) || [],
    isAdmin: (tokenResult?.claims?.isAdmin as boolean) || false,
    isAuthorized: (tokenResult?.claims?.authorized as boolean) || false,
    isRefreshing: true,
    loginStep: 'loading_permissions',
    firecall: tokenResult?.claims?.firecall as string | undefined,
    firecallWrite: tokenResult?.claims?.firecallWrite as boolean | undefined,
  };
}

async function handleSessionBasedRefresh(
  session: any,
  setNeedsReLogin: (value: boolean) => void,
  setCredentialsRefreshed: (value: boolean) => void,
  serverLogin: () => Promise<void>
) {
  if (!auth.currentUser) return;

  const tokenClaims = (await auth.currentUser.getIdTokenResult()).claims;
  const sessionGroups = uniqueArray(session.user.groups || [])?.sort().join(',');
  const tokenGroups = uniqueArray((tokenClaims.groups as string[]) || [])?.sort().join(',');

  if (
    session.user.isAuthorized !== tokenClaims.authorized ||
    sessionGroups !== tokenGroups
  ) {
    console.info(`token claims differ from session data, attempting auto-refresh`);

    const refreshed = await refreshTokenUntilClaimsMatch(
      session.user.isAuthorized,
      session.user.groups || []
    );

    if (refreshed) {
      console.info(`token auto-refreshed successfully`);
      setNeedsReLogin(false);
      setCredentialsRefreshed(true);
      await serverLogin();
    } else {
      console.warn(`token claims still differ after auto-refresh, manual re-login may be required`);
      setNeedsReLogin(true);
    }
  } else {
    setNeedsReLogin(false);
  }
}

async function handleFirestoreBasedRefresh(
  uid: string,
  setNeedsReLogin: (value: boolean) => void,
  setLoginStatus: React.Dispatch<React.SetStateAction<LoginData>>
) {
  const userDoc = await getDoc(doc(firestore, USER_COLLECTION_ID, uid));
  const userData = userDoc.data();

  if (auth.currentUser && userData) {
    const tokenClaims = (await auth.currentUser.getIdTokenResult()).claims;
    const userDataGroups = uniqueArray(userData.groups || [])?.sort().join(',');
    const tokenGroups = uniqueArray((tokenClaims.groups as string[]) || [])?.sort().join(',');

    if (userData.authorized !== tokenClaims.authorized || userDataGroups !== tokenGroups) {
      console.warn(`token claims differ from firebase data, relogin required.`);
      setNeedsReLogin(true);
    } else {
      setNeedsReLogin(false);
    }
  }

  if (userData?.authorized) {
    setLoginStatus((prev) => ({
      ...prev,
      isAuthorized: true,
      messagingTokens: userData.messaging,
      groups: [...(userData.groups || []), 'allUsers'],
      isRefreshing: false,
      isAdmin: prev.isAdmin || userData?.isAdmin === true,
    }));
  } else {
    setLoginStatus((prev) => ({ ...prev, isRefreshing: false }));
  }
}
