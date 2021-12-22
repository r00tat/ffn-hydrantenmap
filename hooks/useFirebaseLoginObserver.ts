import { User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../components/firebase/app';

export interface LoginStatus {
  isSignedIn: boolean;
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
    isSignedIn: true,
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
        });
      }
    );
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

  return loginStatus;
}
