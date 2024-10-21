'use client';

import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { signOut as signOutJsClient } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { firebaseTokenLogin } from '../app/firebaseAuth';
import { auth, firestore } from '../components/firebase/firebase';
import { USER_COLLECTION_ID } from '../components/firebase/firestore';
import { getMyGroupsFromServer, Group } from '../app/groups/GroupAction';

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
}

export interface LoginStatus extends LoginData {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

function nonNull(value: any) {
  return value !== null ? value : undefined;
}

const SESSION_STORAGE_AUTH_KEY = 'fbAuth';

export default function useFirebaseLoginObserver(): LoginStatus {
  const [loginStatus, setLoginStatus] = useState<LoginData>({
    isSignedIn: false,
    isAuthorized: false,
    isAdmin: false,
    myGroups: [],
  }); // Local signed-in state.
  const [uid, setUid] = useState<string>();
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [needsReLogin, setNeedsReLogin] = useState(false);

  const refresh = useCallback(async () => {
    console.info(`refreshing user data for ${uid}`);
    if (uid) {
      try {
        const userDoc = await getDoc(doc(firestore, USER_COLLECTION_ID, uid));
        const userData = userDoc.data();
        console.info(`refreshed user data: `, userData);

        if (auth.currentUser && userData) {
          const tokenClaims = (await auth.currentUser.getIdTokenResult())
            .claims;
          if (
            userData.authorized !== tokenClaims.authorized ||
            userData.groups?.join(',') !==
              (tokenClaims.groups as string[])?.join(',')
          ) {
            // need to login again
            console.warn(
              `token claims differ from firebase data, relogin required.`,
              tokenClaims,
              userData
            );
            setNeedsReLogin(true);
          } else {
            setNeedsReLogin(false);
          }
        }

        if (userData?.authorized) {
          // console.info(`user is authorized`);
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
          console.log(`user is not authorized:`, userData);
          setLoginStatus((prev) => ({
            ...prev,
            isRefreshing: false,
          }));
        }
      } catch (err) {
        console.error(`failed to fetch user doc`, err);
      }
    }
  }, [uid]);

  const serverLogin = useCallback(async () => {
    console.info(`starting server login`);
    const token = await auth.currentUser?.getIdToken();
    // console.info(`got token`, token);
    if (token) {
      const loginResult = await firebaseTokenLogin(token);
      console.info(`server side login result: `, loginResult);
    } else {
      console.info(`no token received in server side login`);
    }
  }, []);

  // Listen to the Firebase Auth state and set the local state.
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged(
      async (user: User | null) => {
        let u: User | undefined = user != null ? user : undefined;
        console.info(`login status changed:`, u);
        setUid(u?.uid);

        const token = await user?.getIdToken();
        if (token) {
          await serverLogin();
        }

        const tokenResult = await user?.getIdTokenResult();
        const idToken = await user?.getIdToken();
        console.info(`user token result`, tokenResult);

        const authData: any = {
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
          groups: tokenResult?.claims?.groups || [],
          isAdmin: tokenResult?.claims?.isAdmin || false,
          isAuthorized: tokenResult?.claims?.authorized || false,
          isRefreshing: true,
        };
        // if (window && window.sessionStorage) {
        //   window.sessionStorage.setItem(SESSION_STORAGE_AUTH_KEY, JSON.stringify(authData));
        // }

        setLoginStatus((prev) => ({ ...prev, ...authData }));
        await refresh();
      }
    );
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, [refresh, serverLogin]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (window && window.sessionStorage) {
      const authText = window.sessionStorage.getItem(SESSION_STORAGE_AUTH_KEY);
      if (authText) {
        const auth: LoginData = JSON.parse(authText);
        if (auth.expiration && new Date(auth.expiration) > new Date()) {
          // token valid, use credentials for login status
          console.info(`using cached login status:`, auth);
          setLoginStatus({ ...auth, isRefreshing: true });
        }
      }
    }
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
  });

  useEffect(() => {
    (async () => {
      if (loginStatus.isSignedIn && loginStatus.isAuthorized) {
        const myGs = await getMyGroupsFromServer();
        setMyGroups(myGs);
      }
    })();
  }, [loginStatus.isAuthorized, loginStatus.isSignedIn]);

  const fbSignOut = useCallback(async () => {
    if (window && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_STORAGE_AUTH_KEY);
    }

    console.info(`authjs client logout`);
    await signOutJsClient();
    console.info(`firebase logout`);
    await auth.signOut();
  }, []);

  return {
    ...loginStatus,
    myGroups,
    refresh,
    signOut: fbSignOut,
    needsReLogin,
  };
}
