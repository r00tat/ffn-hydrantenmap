'use client';

import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { signOut as signOutJsClient } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { firebaseTokenLogin } from '../app/firebaseAuth';
import { auth, firestore } from '../components/firebase/firebase';

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

  const refresh = useCallback(async () => {
    if (loginStatus.isSignedIn) {
      const userDoc = await getDoc(
        doc(firestore, 'user', '' + loginStatus.uid)
      );
      const userData = userDoc.data();
      console.info(`refresh user data: ${JSON.stringify(userData)}`);
      if (userData?.authorized) {
        setLoginStatus((prev) => ({
          ...prev,
          isAuthorized: true,
          isAdmin: prev.isAdmin || userData?.isAdmin === true,
          messagingTokens: userData.messaging,
          chatNotifications: userData.chatNotifications,
        }));
      }
    }
  }, [loginStatus.isSignedIn, loginStatus.uid]);

  // Listen to the Firebase Auth state and set the local state.
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged(
      async (user: User | null) => {
        let u: User | undefined = user != null ? user : undefined;
        console.info(`login status changed:`, u);

        const token = await user?.getIdToken();
        if (token) {
          const loginResult = await firebaseTokenLogin(token);
          console.info(`server side login result: `, loginResult);
        }

        const tokenResult = await user?.getIdTokenResult();

        const authData: LoginData = {
          isSignedIn: !!user,
          user: user !== null ? user : undefined,
          email: nonNull(u?.email),
          displayName: nonNull(u?.displayName),
          uid: nonNull(u?.uid),
          photoURL: nonNull(u?.photoURL),
          isAuthorized: (u?.email?.indexOf('@ff-neusiedlamsee.at') || 0) > 0,
          isAdmin: u?.email === 'paul.woelfel@ff-neusiedlamsee.at',
          expiration: tokenResult?.expirationTime,
        };
        if (window && window.sessionStorage) {
          window.sessionStorage.setItem('fbAuth', JSON.stringify(authData));
        }

        setLoginStatus(authData);
      }
    );
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

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
          setLoginStatus(auth);
        }
      }
    }
  }, []);

  const fbSignOut = useCallback(async () => {
    console.info(`authjs client logout`);
    await signOutJsClient();
    console.info(`firebase logout`);
    await auth.signOut();
  }, []);

  return { ...loginStatus, refresh, signOut: fbSignOut };
}
