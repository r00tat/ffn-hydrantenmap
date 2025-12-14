'use client';

import React, { createContext } from 'react';
import useFirebaseLoginObserver, {
  LoginStatus,
} from '../../hooks/useFirebaseLoginObserver';
import { useFirebaseCustomTokenLogin } from '../../hooks/useFirebaseCustomTokenLogin';

export const FirebaseLoginContext = createContext<LoginStatus>({
  isSignedIn: false,
  isAuthorized: false,
  isAdmin: false,
  signOut: async () => {},
  refresh: async () => {},
  myGroups: [],
});

export default function FirebaseUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useFirebaseCustomTokenLogin();
  const authInfo = useFirebaseLoginObserver();
  return (
    <FirebaseLoginContext.Provider value={authInfo}>
      {children}
    </FirebaseLoginContext.Provider>
  );
}
