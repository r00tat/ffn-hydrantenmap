'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendSignInLinkToEmail,
  sendEmailVerification,
  signInWithEmailLink,
  updateProfile,
} from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const googleProvider = new GoogleAuthProvider();

// const uiConfig: firebaseui.auth.Config = {
//   signInOptions: [
//     GoogleAuthProvider.PROVIDER_ID,
//     EmailAuthProvider.PROVIDER_ID,
//   ],
//   signInFlow: 'popup',
//   // autoUpgradeAnonymousUsers: true,
//   callbacks: {
//     signInSuccessWithAuthResult: (authResult) => {
//       console.info(`firebaseui login success`, authResult);
//       return false;
//     },
//   },
// };

export default function StyledLoginButton({
  firebaseAuth: auth,
}: {
  firebaseAuth: Auth;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [registerVisible, setRegisterVisible] = useState(false);
  const [registerDisabled, setRegisterDisabled] = useState(false);
  const [name, setName] = useState('');

  const googleSignIn = useCallback(async () => {
    setError(undefined);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // This gives you a Google Access Token. You can use it to access the Google API.
      // const credential = GoogleAuthProvider.credentialFromResult(result);
      const user = result.user;

      const userInfo = getAdditionalUserInfo(result);

      console.info(`signin success`, user, userInfo);
    } catch (err) {
      console.error(`google login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth]);

  const emailSignIn = useCallback(async () => {
    try {
      const result2 = await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.protocol}//${
          window.location.host
        }/login?emailsignin=true&url=${encodeURIComponent(
          window.location.href
        )}`,
        handleCodeInApp: true,
      });
      console.info(`sending sign in link to ${email}`, result2);
      window.localStorage.setItem('emailForSignIn', email);

      // const userCredential = await signInWithEmailAndPassword(
      //   auth,
      //   email,
      //   password
      // );
      // // Signed in
      // const user = userCredential.user;
      // console.info(`sign in with password`, user);
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth, email]);
  const signUp = useCallback(async () => {
    try {
      console.info(`creating user ${email}`);
      setRegisterDisabled(true);
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password || uuidv4()
      );

      console.info(`update profile`);
      await updateProfile(userCredential.user, {
        displayName: name,
      });
      // Signed in
      console.info(`sending email verification`);
      sendEmailVerification(userCredential.user);

      const user = userCredential.user;
      setError(
        'Der Benutzer wurde erfolgreich erstellt. Zur Verifikation der Email Adresse wurde ein Email versandt.'
      );

      console.info(`sign in with password`, user);
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
    setRegisterDisabled(false);
  }, [auth, email, name, password]);

  useEffect(() => {
    (async () => {
      const params = new URL(document.location.toString()).searchParams;
      if (params.get('emailsignin') === 'true') {
        // try to sigin in
        const email = window.localStorage.getItem('emailForSignIn');
        if (email) {
          try {
            const result = await signInWithEmailLink(
              auth,
              email,
              window.location.href
            );
            window.localStorage.removeItem('emailForSignIn');
            console.info(`login result with email: ${email}`, result);
          } catch (err) {
            console.error(`email signin failed`, err);
            setError((err as any).message || `${err}`);
          }
        }
      }
    })();
  }, [auth]);

  return (
    <Box padding={4}>
      {error && (
        <Alert severity="error">
          <AlertTitle>Login fehlgeschlagen</AlertTitle>
          {error}
        </Alert>
      )}

      <Button color="primary" variant="contained" onClick={googleSignIn}>
        Google Login
      </Button>

      <Typography style={{ marginTop: 20 }}>
        Login mit Email und Passwort
      </Typography>
      <form>
        <FormControl sx={{ width: '25ch' }}>
          <TextField
            id="email"
            label="Email"
            variant="standard"
            type="email"
            value={email}
            autoComplete="username"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setEmail(event.target.value);
            }}
          />
          {/* <TextField
            id="password"
            label="Password"
            variant="standard"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setPassword(event.target.value);
            }}
          /> */}
          {registerVisible && (
            <TextField
              id="name"
              label="Name"
              variant="standard"
              type="name"
              autoComplete="current-name"
              value={name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setName(event.target.value);
              }}
            />
          )}
          {!registerVisible && (
            <Button
              color="primary"
              variant="contained"
              onClick={emailSignIn}
              style={{ marginTop: 20 }}
            >
              Login
            </Button>
          )}
          <Button
            color="secondary"
            variant="contained"
            disabled={registerDisabled}
            onClick={() =>
              registerVisible ? signUp() : setRegisterVisible(true)
            }
            style={{ marginTop: 20 }}
          >
            {!registerVisible
              ? 'Neu registrieren'
              : 'Mit diesem Namen und Email registrieren'}
          </Button>
        </FormControl>
      </form>
    </Box>
  );
}
