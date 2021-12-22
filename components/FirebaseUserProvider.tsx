import React, { createContext } from 'react';
import useFirebaseLoginObserver, {
  LoginStatus,
} from '../hooks/useFirebaseLoginObserver';

export const FirebaseLoginContext = createContext<LoginStatus>({
  isSignedIn: false,
  signOut: async () => {},
});

export default function FirebaseUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const positionInfo = useFirebaseLoginObserver();
  return (
    <FirebaseLoginContext.Provider value={positionInfo}>
      {children}
    </FirebaseLoginContext.Provider>
  );
}
