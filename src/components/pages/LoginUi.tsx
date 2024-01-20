import {
  Button,
  FormControlLabel,
  FormGroup,
  Paper,
  Switch,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import OneTapLogin from '../auth/OneTapLogin';
import StyledLoginButton from '../firebase/StyledLogin';
import { auth } from '../firebase/firebase';
import { useDebugLogging } from '../../hooks/useDebugging';

export default function LoginUi() {
  const { isSignedIn, isAuthorized, displayName, email } = useFirebaseLogin();
  const { displayMessages, setDisplayMessages } = useDebugLogging();

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
            Login details: <br />
            {displayName} {email}
            <br />
            Authenticated via {auth.currentUser?.providerId}
            <br />
            isSignedIn: {isSignedIn ? 'Y' : 'N'}
            <br />
            isAuthorized: {isAuthorized ? 'Y' : 'N'}
          </Typography>

          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={displayMessages}
                  onChange={(event) =>
                    setDisplayMessages &&
                    setDisplayMessages(event.target.checked)
                  }
                />
              }
              label={'Debug Informationen anzeigen'}
            />
          </FormGroup>
        </div>
      )}
    </>
  );
}
