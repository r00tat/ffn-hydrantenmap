'use client';
import React from 'react';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useDebugLogging } from '../../hooks/useDebugging';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { auth } from '../firebase/firebase';

export default function DebugLoggingSwitch() {
  const { isSignedIn, isAuthorized, displayName, email, signOut } =
    useFirebaseLogin();
  const { displayMessages, setDisplayMessages } = useDebugLogging();
  return (
    <>
      <FormGroup>
        <FormControlLabel
          control={
            <Switch
              checked={displayMessages}
              onChange={(event) => setDisplayMessages((old) => !old)}
            />
          }
          label={'Debug Informationen anzeigen'}
        />
      </FormGroup>
      {displayMessages && (
        <Typography>
          Logeddin as:&nbsp;
          {displayName} {email}
          <br />
          Authenticated via {auth.currentUser?.providerId}
          <br />
          isSignedIn: {isSignedIn ? 'Y' : 'N'}
          <br />
          isAuthorized: {isAuthorized ? 'Y' : 'N'}
          <br />
          Database: {process.env.NEXT_PUBLIC_FIRESTORE_DB}
          <br />
          Build id: {process.env.NEXT_PUBLIC_BUILD_ID}
          <br />
          Node Env: {process.env.NODE_ENV}
        </Typography>
      )}
    </>
  );
}
