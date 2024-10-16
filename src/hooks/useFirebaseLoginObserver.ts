'use client';

import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { signOut as signOutJsClient } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { firebaseTokenLogin } from '../app/firebaseAuth';
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
}

export interface LoginStatus extends LoginData {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

function nonNull(value: any) {
  return value !== null ? value : undefined;
}

export default function useFirebaseLoginObserver(): LoginStatus {
  const [loginStatus, setLoginStatus] = useState<LoginData>({
    isSignedIn: false,
    isAuthorized: false,
    isAdmin: false,
  }); // Local signed-in state.
  const [uid, setUid] = useState<string>();

  const refresh = useCallback(async () => {
    console.info(`refreshing user data for ${uid}`);
    if (uid) {
      try {
        const userDoc = await getDoc(doc(firestore, USER_COLLECTION_ID, uid));
        const userData = userDoc.data();
        console.info(`refreshed user data: `, userData);
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
          // groups: ['allUsers'],
          isRefreshing: true,
        };
        // if (window && window.sessionStorage) {
        //   window.sessionStorage.setItem('fbAuth', JSON.stringify(authData));
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
      const authText = window.sessionStorage.getItem('fbAuth');
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
      window.sessionStorage.setItem('fbAuth', JSON.stringify(loginStatus));
    }
  }, [loginStatus]);

  useEffect(() => {
    // refresh all 30 minutes
    const clearServerInterval = setInterval(serverLogin, 1000 * 60 * 30);

    return () => {
      clearInterval(clearServerInterval);
    };
  });

  const fbSignOut = useCallback(async () => {
    console.info(`authjs client logout`);
    await signOutJsClient();
    console.info(`firebase logout`);
    await auth.signOut();
  }, []);

  return { ...loginStatus, refresh, signOut: fbSignOut };
}
