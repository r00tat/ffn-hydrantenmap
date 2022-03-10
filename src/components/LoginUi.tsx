import { Button, Typography } from '@mui/material';
import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import Link from 'next/link';
// import 'firebaseui/dist/firebaseui.css';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import useFirebaseLogin from '../hooks/useFirebaseLogin';
import { auth } from './firebase/firebase';
import OneTapLogin from './OneTapLogin';

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
  const { isSignedIn, isAuthorized } = useFirebaseLogin();

  return (
    <>
      {!isSignedIn && (
        <>
          <Typography>
            Für die Nutzung der Hydrantenkarte ist eine Anmeldung und manuelle
            Freischaltung erforderlich. Bitte registriere dich hier.
          </Typography>
          <StyledFirebaseAuth uiConfig={uiConfig} firebaseAuth={auth} />
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
              <a href="mailto:hydrantenmap@ff-neusiedlamsee.at&amp;subject)=Hydrantenkarte Freischaltung">
                hydrantenmap@ff-neusiedlamsee.at
              </a>{' '}
              für die Freischaltung
            </Typography>
          )}
        </div>
      )}
    </>
  );
}
