'use client';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
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
  credentialsRefreshed: false,
  clearCredentialsRefreshed: () => {},
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
      <Snackbar
        open={authInfo.credentialsRefreshed}
        autoHideDuration={6000}
        onClose={authInfo.clearCredentialsRefreshed}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={authInfo.clearCredentialsRefreshed}
          severity="success"
          variant="filled"
        >
          Ihre Berechtigungen wurden aktualisiert.
        </Alert>
      </Snackbar>
    </FirebaseLoginContext.Provider>
  );
}
