import { Button, Typography } from '@mui/material';
import Link from 'next/link';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import OneTapLogin from './OneTapLogin';
import StyledLoginButton from './firebase/StyledLogin';
import { auth } from './firebase/firebase';

export default function Login() {
  const { isSignedIn, isAuthorized, displayName, email } = useFirebaseLogin();

  return (
    <>
      {!isSignedIn && (
        <>
          <Typography>
            Für die Nutzung der Hydrantenkarte ist eine Anmeldung und manuelle
            Freischaltung erforderlich. Bitte registriere dich hier.
          </Typography>
          <StyledLoginButton firebaseAuth={auth} />
          <OneTapLogin />
        </>
      )}

      {isSignedIn && (
        <div>
          <Typography>Willkommen {auth.currentUser?.displayName}!</Typography>
          <Button onClick={() => auth.signOut()} variant="contained">
            Logout
          </Button>
          {isAuthorized && (
            <>
              <Typography>
                Dein Benutzer ist freigeschalten und kann verwendet werden!
              </Typography>
              <Typography>
                <Link href="/" passHref>
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
          <Typography>
            Login details: {displayName} {email}
            {auth.currentUser?.providerId}
            isSignedIn: {isSignedIn ? 'Y' : 'N'}
            isAuthorized: {isAuthorized ? 'Y' : 'N'}
          </Typography>
        </div>
      )}
    </>
  );
}
