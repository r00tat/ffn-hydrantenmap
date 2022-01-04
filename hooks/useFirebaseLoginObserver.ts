import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, firestore } from '../components/firebase';

export interface LoginStatus {
  isSignedIn: boolean;
  isAuthorized: boolean;
  isAdmin: boolean;
  user?: User;
  email?: string;
  displayName?: string;
  uid?: string;
  signOut: () => Promise<void>;
  photoURL?: string;
}

function nonNull(value: any) {
  return value !== null ? value : undefined;
}

export default function useFirebaseLoginObserver() {
  const [loginStatus, setLoginStatus] = useState<LoginStatus>({
    isSignedIn: false,
    isAuthorized: false,
    isAdmin: false,
    signOut: async () => {},
  }); // Local signed-in state.

  // Listen to the Firebase Auth state and set the local state.
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged(
      (user: User | null) => {
        let u: User | undefined = user != null ? user : undefined;

        setLoginStatus({
          isSignedIn: !!user,
          user: user !== null ? user : undefined,
          email: nonNull(u?.email),
          displayName: nonNull(u?.displayName),
          uid: nonNull(u?.uid),
          signOut: auth.signOut,
          photoURL: nonNull(u?.photoURL),
          isAuthorized: (u?.email?.indexOf('@ff-neusiedlamsee.at') || 0) > 0,
          isAdmin: u?.email === 'paul.woelfel@ff-neusiedlamsee.at',
        });
      }
    );
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

  useEffect(() => {
    if (
      loginStatus.isSignedIn &&
      loginStatus.uid &&
      !loginStatus.isAuthorized
    ) {
      (async () => {
        const userDoc = await getDoc(
          doc(firestore, 'user', '' + loginStatus.uid)
        );
        if (userDoc.data()?.authorized) {
          setLoginStatus({
            ...loginStatus,
            isAuthorized: true,
            isAdmin: loginStatus.isAdmin || userDoc.data()?.isAdmin === true,
          });
        }
      })();
    }
  }, [loginStatus]);

  return loginStatus;
}
