'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import OneTapLogin from '../auth/OneTapLogin';
import StyledLoginButton from '../firebase/StyledLogin';
import { auth } from '../firebase/firebase';
import DebugLoggingSwitch from '../logging/DebugLoggingSwitch';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const FirebaseUiLogin = dynamic(() => import('../firebase/firebase-ui-login'), {
  ssr: false,
});

export default function LoginUi() {
  const {
    isSignedIn,
    isAuthorized,
    displayName,
    email,
    signOut,
    uid,
    isRefreshing,
    needsReLogin,
    myGroups,
  } = useFirebaseLogin();

  const [groupClaims, setGroupClaims] = useState('');
  useEffect(() => {
    if (isAuthorized && auth.currentUser) {
      (async () => {
        if (auth.currentUser) {
          const tokenClaims = (await auth.currentUser.getIdTokenResult())
            .claims;
          setGroupClaims(
            ((tokenClaims.groups as string[]) || [])
              .map((g) => myGroups.find((myG) => myG.id === g)?.name || g)
              .sort()
              .join(', ')
          );
        }
      })();
    }
  }, [isAuthorized, myGroups]);

  return (
    <>
      {!isSignedIn && (
        <>
          <Paper sx={{ p: 2, m: 2 }}>
            <Typography>
              Für die Nutzung der Einsatzkarte ist eine Anmeldung und manuelle
              Freischaltung erforderlich. Bitte melde dich an.
            </Typography>
            {/* <StyledLoginButton firebaseAuth={auth} /> */}
            <OneTapLogin />
            <FirebaseUiLogin />
          </Paper>
        </>
      )}

      {isSignedIn && (
        <Box margin={4}>
          <Typography>
            Willkommen {auth.currentUser?.displayName} (
            {auth.currentUser?.email})!
            {isRefreshing && (
              <>
                Lade Benutzerinformationen...
                <CircularProgress />
              </>
            )}
          </Typography>
          <Button onClick={() => signOut()} variant="contained">
            Logout
          </Button>
          {isAuthorized && (
            <>
              <Typography>
                Dein Benutzer ist freigeschalten und kann verwendet werden!{' '}
                <br />
                Angemeldet als: {displayName} {email} (user id: {uid})
                <br />
                Deine Gruppen:{' '}
              </Typography>
              <ul>
                {myGroups.map((g) => (
                  <li key={g.id}>{g.name}</li>
                ))}
              </ul>
              {!needsReLogin && (
                <Typography>
                  <Link href="/" passHref>
                    <Button variant="outlined">Weiter zur Einsatzkarte</Button>
                  </Link>
                </Typography>
              )}
            </>
          )}
          {!isAuthorized && (
            <Typography>
              Dein Benutzer wurde erfolgreich angemeldet, ist aber noch nicht
              freigeschalten. Du hast eine Email zur Adressverifikation
              erhalten. Bitte wende dich nach der Bestätigung der Email an{' '}
              <a href="mailto:hydrantenmap@ff-neusiedlamsee.at&amp;subject=Einsatzkarte Freischaltung">
                hydrantenmap@ff-neusiedlamsee.at
              </a>{' '}
              für die Freischaltung
            </Typography>
          )}

          {needsReLogin && (
            <Typography color="error" borderColor="red">
              Deine Autorisierung hat sich geändert. Um die neuen Rechte nutzten
              zu können, musst du dich aus und neu einloggen.
              <br />
              Deine aktuellen Gruppen laut Datenbank:{' '}
              {myGroups
                .map((g) => g.name)
                .sort()
                .join(', ')}
              <br />
              Deine Gruppen laut Login: {groupClaims}
              <br />
              <Button onClick={() => signOut()} variant="contained">
                Logout
              </Button>
            </Typography>
          )}

          <DebugLoggingSwitch />
        </Box>
      )}
    </>
  );
}
