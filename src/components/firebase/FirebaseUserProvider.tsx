import React, { createContext } from 'react';
import useFirebaseLoginObserver, {
  LoginStatus,
} from '../../hooks/useFirebaseLoginObserver';

export const FirebaseLoginContext = createContext<LoginStatus>({
  isSignedIn: false,
  isAuthorized: false,
  isAdmin: false,
  signOut: async () => {},
});

export default function FirebaseUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const authInfo = useFirebaseLoginObserver();
  return (
    <FirebaseLoginContext.Provider value={authInfo}>
      {children}
    </FirebaseLoginContext.Provider>
  );
}
