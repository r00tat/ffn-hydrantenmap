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

// Re-export types for backward compatibility
export type { LoginData, LoginStatus, LoginStep } from './auth/types';

function nonNull(value: any) {
  return value !== null ? value : undefined;
}

function getInitialLoginStatus(): LoginData {
  const cachedAuth = loadAuthFromSessionStorage();
  if (cachedAuth) {
    return { ...cachedAuth, isRefreshing: true, isAuthLoading: false, loginStep: 'done' };
  }
  return {
    isSignedIn: false,
    isAuthorized: false,
    isAdmin: false,
    isAuthLoading: true,
    myGroups: [],
    loginStep: 'idle',
  };
}

export default function useFirebaseLoginObserver(): LoginStatus {
  const { data: session, status: sessionStatus } = useSession();

  const [loginStatus, setLoginStatus] = useState<LoginData>(getInitialLoginStatus);
  const [uid, setUid] = useState<string>();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [needsReLogin, setNeedsReLogin] = useState(false);
  const [credentialsRefreshed, setCredentialsRefreshed] = useState(false);
  const lastKnownAuthRef = useRef<AuthState | null>(null);
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
      const groups = await getMyGroupsFromServer().catch((err) => {
        console.error('getMyGroupsFromServer failed:', err);
        return [] as Group[];
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

  // Firebase Auth state listener
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged(
      async (user: User | null) => {
        const u: User | undefined = user != null ? user : undefined;
        setUid(u?.uid);

        if (user) {
          setLoginStatus((prev) => ({ ...prev, loginStep: 'authenticating' }));
          const token = await user.getIdToken();
          if (token) {
            const hasValidSession = sessionStatusRef.current === 'authenticated';

            if (!hasValidSession) {
              setLoginStatus((prev) => ({ ...prev, loginStep: 'verifying' }));
              await serverLoginRef.current();
              lastRefreshRef.current = Date.now();
              // Force-refresh token only on fresh login
              await user.getIdToken(true);
            }
          }

          const tokenResult = await user.getIdTokenResult();
          const idToken = await user.getIdToken();

          const authData: Partial<LoginData> = {
            isSignedIn: true,
            isAuthLoading: false,
            user,
            email: nonNull(u?.email),
            displayName: nonNull(u?.displayName),
            uid: nonNull(u?.uid),
            photoURL: nonNull(u?.photoURL),
            expiration: tokenResult?.expirationTime,
            idToken,
            groups: (tokenResult?.claims?.groups as string[]) || [],
            isAdmin: (tokenResult?.claims?.isAdmin as boolean) || false,
            isAuthorized: (tokenResult?.claims?.authorized as boolean) || false,
            isRefreshing: true,
            loginStep: 'loading_permissions',
            firecall: tokenResult?.claims?.firecall as string | undefined,
          };

          setLoginStatus((prev) => ({ ...prev, ...authData }));
          await refreshRef.current(user.uid);
          setLoginStatus((prev) => ({ ...prev, loginStep: 'done' }));
          console.info(`login completed for ${user.email}`);
        } else {
          setLoginStatus((prev) => ({
            ...prev,
            isSignedIn: false,
            isAuthLoading: false,
            user: undefined,
            loginStep: 'idle',
          }));
        }
      }
    );
    return () => unregisterAuthObserver();
  }, []);

  // Save to session storage when auth changes
  useEffect(() => {
    saveAuthToSessionStorage(loginStatus);
  }, [loginStatus]);

  // Track when the last server login happened to avoid unnecessary refreshes
  const lastRefreshRef = useRef<number>(0);

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
    clearAuthFromSessionStorage();
    // redirect: false — NextAuth server otherwise falls back to NEXTAUTH_URL
    // when the callbackUrl origin doesn't match (Capacitor WebView, dev
    // tunnels), which sends users to localhost.
    await signOutJsClient({ redirect: false });
    await auth.signOut();
    if (Capacitor.isNativePlatform()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch (err) {
        console.warn('native firebase signOut failed', err);
      }
    }
    console.info(`logout completed`);
    if (typeof window !== 'undefined') {
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
    myGroups,
    refresh,
    signOut: fbSignOut,
    needsReLogin,
    credentialsRefreshed,
    clearCredentialsRefreshed,
  };
}

// Helper functions to reduce complexity in the main hook

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
