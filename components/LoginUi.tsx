import { Box, Button, Typography } from '@mui/material';
import * as firebaseui from 'firebaseui';
import { auth, firebaseApp } from '../components/firebase/app';
import React, { useEffect, useState } from 'react';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
// import 'firebaseui/dist/firebaseui.css';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import * as firebase from 'firebase/compat/app';

const uiConfig = {
  signInOptions: [
    GoogleAuthProvider.PROVIDER_ID,
    EmailAuthProvider.PROVIDER_ID,
  ],
  signInFlow: 'popup',
  // autoUpgradeAnonymousUsers: true,
  callbacks: {
    signInSuccessWithAuthResult: () => false,
  },
};

export default function Login() {
  const [isSignedIn, setIsSignedIn] = useState(false); // Local signed-in state.

  // Listen to the Firebase Auth state and set the local state.
  useEffect(() => {
    const unregisterAuthObserver = auth.onAuthStateChanged((user) => {
      setIsSignedIn(!!user);
    });
    return () => unregisterAuthObserver(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

  if (isSignedIn) {
    return (
      <div>
        <Typography>Willkommen {auth.currentUser?.displayName}!</Typography>
        <Button onClick={() => auth.signOut()}>Logout</Button>
      </div>
    );
  }
  return (
    <>
      <StyledFirebaseAuth uiConfig={uiConfig} firebaseAuth={auth} />
    </>
  );
}
