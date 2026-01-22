'use client';

import { User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { signOut as signOutJsClient, useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firebaseTokenLogin } from '../app/firebaseAuth';
import { getMyGroupsFromServer } from '../app/groups/GroupAction';
import { Group } from '../app/groups/groupHelpers';
import { uniqueArray } from '../common/arrayUtils';
import { auth, firestore } from '../components/firebase/firebase';
import { USER_COLLECTION_ID } from '../components/firebase/firestore';

export interface LoginData {
  isSignedIn: boolean;
  isAuthorized: boolean;
  isAdmin: boolean;
  user?: User;
  email?: string;
  displayName?: string;
  uid?: string;
  photoURL?: string;
  messagingTokens?: string[];
  expiration?: string;
  idToken?: string;
  groups?: string[];
  isRefreshing?: boolean;
  myGroups: Group[];
  needsReLogin?: boolean;
  firecall?: string;
}

export interface LoginStatus extends LoginData {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  credentialsRefreshed: boolean;
  clearCredentialsRefreshed: () => void;
}

function nonNull(value: any) {
  return value !== null ? value : undefined;
}

const SESSION_STORAGE_AUTH_KEY = 'fbAuth';

export default function useFirebaseLoginObserver(): LoginStatus {
  // Use NextAuth session for initial auth state (faster than Firestore fetch)
  const { data: session, status: sessionStatus } = useSession();

  const [loginStatus, setLoginStatus] = useState<LoginData>({
    isSignedIn: false,
    isAuthorized: false,
    isAdmin: false,
    myGroups: [],
  }); // Local signed-in state.
  const [uid, setUid] = useState<string>();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [needsReLogin, setNeedsReLogin] = useState(false);
  const [credentialsRefreshed, setCredentialsRefreshed] = useState(false);
  const lastKnownAuthRef = useRef<{
    authorized?: boolean;
    groups?: string[];
  } | null>(null);

  // Derive auth state from session when available (faster initial load)
  // Session data takes precedence over loginStatus for these fields
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

  const refresh = useCallback(async () => {
    if (uid) {
      try {
        // If we have session data, use it instead of fetching from Firestore
        const hasSessionData = session?.user?.isAuthorized !== undefined;

        // Fetch groups (for display names) - this is still needed
        const groups = await getMyGroupsFromServer().catch(() => [] as Group[]);
        setMyGroups(groups);

        if (hasSessionData) {
          // Use session data - much faster than Firestore fetch

          // Check if token claims match session (for needsReLogin detection)
          if (auth.currentUser) {
            const tokenClaims = (await auth.currentUser.getIdTokenResult())
              .claims;
            const sessionGroups = uniqueArray(session.user.groups || [])
              ?.sort()
              .join(',');
            const tokenGroups = uniqueArray(
              (tokenClaims.groups as string[]) || []
            )
              ?.sort()
              .join(',');
            if (
              session.user.isAuthorized !== tokenClaims.authorized ||
              sessionGroups !== tokenGroups
            ) {
              console.warn(
                `token claims differ from session data, relogin required.`
              );
              setNeedsReLogin(true);
            } else {
              setNeedsReLogin(false);
            }
          }

          setLoginStatus((prev) => ({
            ...prev,
            isAuthorized: session.user.isAuthorized,
            isAdmin: session.user.isAdmin,
            groups: session.user.groups,
            firecall: session.user.firecall,
            isRefreshing: false,
          }));
        } else {
          // Fallback: fetch from Firestore if no session
          const userDoc = await getDoc(doc(firestore, USER_COLLECTION_ID, uid));
          const userData = userDoc.data();

          if (auth.currentUser && userData) {
            const tokenClaims = (await auth.currentUser.getIdTokenResult())
              .claims;
            const userDataGroups = uniqueArray(userData.groups || [])
              ?.sort()
              .join(',');
            const tokenGroups = uniqueArray(
              (tokenClaims.groups as string[]) || []
            )
              ?.sort()
              .join(',');
            if (
              userData.authorized !== tokenClaims.authorized ||
              userDataGroups !== tokenGroups
            ) {
              console.warn(
                `token claims differ from firebase data, relogin required.`
              );
              setNeedsReLogin(true);
            } else {
              setNeedsReLogin(false);
            }
          }

          if (userData?.authorized) {
            const newData = {
              isAuthorized: true,
              messagingTokens: userData.messaging,
              chatNotifications: userData.chatNotifications,
              groups: [...(userData.groups || []), 'allUsers'],
              isRefreshing: false,
            };
            setLoginStatus((prev) => ({
              ...prev,
              ...newData,
              isAdmin: prev.isAdmin || userData?.isAdmin === true,
            }));
          } else {
            setLoginStatus((prev) => ({
              ...prev,
              isRefreshing: false,
            }));
          }
        }
      } catch (err) {
        console.error(`failed to refresh user data`, err);
        setLoginStatus((prev) => ({
          ...prev,
          isRefreshing: false,
        }));
      }
    }
  }, [uid, session]);

  const serverLogin = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (token) {
      await firebaseTokenLogin(token);
    } else {
      console.warn(`server login: no token available`);
    }
  }, []);

  const authStateChangedHandler = useCallback(
    async (user: User | null) => {
      let u: User | undefined = user != null ? user : undefined;
      setUid(u?.uid);

      const token = await user?.getIdToken();
      if (token) {
        await serverLogin();
      }

      const tokenResult = await user?.getIdTokenResult();
      const idToken = await user?.getIdToken();

      const authData: Partial<LoginData> = {
        isSignedIn: !!user,
        user: user !== null ? user : undefined,
        email: nonNull(u?.email),
        displayName: nonNull(u?.displayName),
        uid: nonNull(u?.uid),
        photoURL: nonNull(u?.photoURL),
        // isAuthorized: false,
        // isAdmin: false,
        expiration: tokenResult?.expirationTime,
        idToken,
        groups: (tokenResult?.claims?.groups as string[]) || [],
        isAdmin: (tokenResult?.claims?.isAdmin as boolean) || false,
        isAuthorized: (tokenResult?.claims?.authorized as boolean) || false,
        isRefreshing: true,
        firecall: tokenResult?.claims?.firecall as string | undefined,
      };
      // if (window && window.sessionStorage) {
      //   window.sessionStorage.setItem(SESSION_STORAGE_AUTH_KEY, JSON.stringify(authData));
      // }

      setLoginStatus((prev) => ({ ...prev, ...authData }));
      await refresh();
      if (user) {
        console.info(`login completed for ${user.email}`);
      }
    },
    [refresh, serverLogin]
  );
  // Listen to the Firebase Auth state and set the local state.
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged(
      authStateChangedHandler
    );
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, [authStateChangedHandler]);

  useEffect(() => {
    (async () => {
      if (window && window.sessionStorage) {
        const authText = window.sessionStorage.getItem(
          SESSION_STORAGE_AUTH_KEY
        );
        if (authText) {
          const auth: LoginData = JSON.parse(authText);
          if (auth.expiration && new Date(auth.expiration) > new Date()) {
            // token valid, use credentials for login status
            setLoginStatus({ ...auth, isRefreshing: true });
          }
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (
      window &&
      window.sessionStorage &&
      loginStatus.isAuthorized &&
      !loginStatus.isRefreshing &&
      loginStatus.expiration &&
      new Date(loginStatus.expiration) > new Date()
    ) {
      window.sessionStorage.setItem(
        SESSION_STORAGE_AUTH_KEY,
        JSON.stringify(loginStatus)
      );
    }
  }, [loginStatus]);

  useEffect(() => {
    // refresh all 30 minutes
    const clearServerInterval = setInterval(serverLogin, 1000 * 60 * 30);

    return () => {
      clearInterval(clearServerInterval);
    };
  }, [serverLogin]);

  const fbSignOut = useCallback(async () => {
    if (window && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_STORAGE_AUTH_KEY);
    }

    await signOutJsClient();
    await auth.signOut();
    console.info(`logout completed`);
  }, []);

  const clearCredentialsRefreshed = useCallback(() => {
    setCredentialsRefreshed(false);
  }, []);

  // Real-time listener for user document changes (authorization updates by admin)
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

        const currentAuth = {
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
          JSON.stringify(currentAuth.groups) !==
            JSON.stringify(prevAuth.groups?.sort());

        if (authChanged && auth.currentUser) {
          console.info(
            `credentials changed by admin, refreshing token and session`
          );
          lastKnownAuthRef.current = currentAuth;

          try {
            // Force Firebase to get fresh ID token with new custom claims
            await auth.currentUser.getIdToken(true);
            // Re-authenticate with NextAuth to update session
            await serverLogin();
            // Refresh local state
            await refresh();
            // Signal that credentials were refreshed
            setCredentialsRefreshed(true);
            setNeedsReLogin(false);
          } catch (err) {
            console.error(`failed to refresh credentials after admin update`, err);
          }
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
    // Override with session-derived values for faster initial load
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
