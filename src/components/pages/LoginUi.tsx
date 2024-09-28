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

export default function LoginUi() {
  const {
    isSignedIn,
    isAuthorized,
    displayName,
    email,
    signOut,
    uid,
    isRefreshing,
  } = useFirebaseLogin();

  return (
    <>
      {!isSignedIn && (
        <>
          <Paper sx={{ p: 2, m: 2 }}>
            <Typography>
              Für die Nutzung der Hydrantenkarte ist eine Anmeldung und manuelle
              Freischaltung erforderlich. Bitte registriere dich hier.
            </Typography>
            <StyledLoginButton firebaseAuth={auth} />
            <OneTapLogin />
          </Paper>
        </>
      )}

      {isSignedIn && (
        <Box>
          <Typography>
            Willkommen {auth.currentUser?.displayName}!
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
              </Typography>
              <Typography>
                <Link href="/" passHref legacyBehavior>
                  <Button variant="outlined">Weiter zur Hydrantenkarte</Button>
                </Link>
              </Typography>
            </>
          )}
          {!isAuthorized && (
            <Typography>
              Dein Benutzer wurde erfolgreich angemeldet, ist aber noch nicht
              freigeschalten. Bitte wende dich an{' '}
              <a href="mailto:hydrantenmap@ff-neusiedlamsee.at&amp;subject=Hydrantenkarte Freischaltung">
                hydrantenmap@ff-neusiedlamsee.at
              </a>{' '}
              für die Freischaltung
            </Typography>
          )}

          <DebugLoggingSwitch />
        </Box>
      )}
    </>
  );
}
