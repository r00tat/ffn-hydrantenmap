import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
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
      (user: User | null) => {
        let u: User | undefined = user != null ? user : undefined;
        console.info(`login status changed:`, u);

        setLoginStatus({
          isSignedIn: !!user,
          user: user !== null ? user : undefined,
          email: nonNull(u?.email),
          displayName: nonNull(u?.displayName),
          uid: nonNull(u?.uid),
          photoURL: nonNull(u?.photoURL),
          isAuthorized: (u?.email?.indexOf('@ff-neusiedlamsee.at') || 0) > 0,
          isAdmin: u?.email === 'paul.woelfel@ff-neusiedlamsee.at',
        });
      }
    );
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...loginStatus, refresh, signOut: auth.signOut };
}
