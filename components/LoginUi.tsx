import { Button, Typography } from '@mui/material';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import React from 'react';
// import 'firebaseui/dist/firebaseui.css';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import { auth } from './firebase';
import useFirebaseLogin from '../hooks/useFirebaseLogin';

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
  const { isSignedIn } = useFirebaseLogin();

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
