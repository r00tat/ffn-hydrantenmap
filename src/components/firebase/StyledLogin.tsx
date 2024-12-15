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
  sendEmailVerification,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const googleProvider = new GoogleAuthProvider();

export default function StyledLoginButton({
  firebaseAuth: auth,
}: {
  firebaseAuth: Auth;
}) {
  const [email, setEmail] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [registerVisible, setRegisterVisible] = useState(false);
  const [registerDisabled, setRegisterDisabled] = useState(false);
  const [name, setName] = useState('');
  const [isWaitingForMagicLink, setIsWaitingForMagicLink] = useState(false);
  const [magicLink, setMagicLink] = useState('');

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
      if (email && magicLink) {
        try {
          const result = await signInWithEmailLink(auth, email, magicLink);
          window.localStorage.removeItem('emailForSignIn');
          console.info(`login result with email: ${email}`, result);
          const url = new URL(magicLink);
          const callbackUrl = url.searchParams.get('url');
          if (callbackUrl) {
            window.location.href = callbackUrl;
          }
        } catch (err) {
          console.error(`email signin failed`, err);
          setError(
            `Email Login fehlgeschlagen: ${(err as any).message || '' + err}`
          );
        }
      } else {
        const result2 = await sendSignInLinkToEmail(auth, email, {
          url: `${window.location.protocol}//${
            window.location.host
          }/login?emailsignin=true&url=${encodeURIComponent(
            window.location.href
          )}`,
          handleCodeInApp: true,
        });
        setIsWaitingForMagicLink(true);
        console.info(`sending sign in link to ${email}`, result2);
        setInfo('Email für den Login versandt. Bitte prüfen Sie Ihre Email.');
        window.localStorage.setItem('emailForSignIn', email);
      }
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth, email, magicLink]);
  const signUp = useCallback(async () => {
    try {
      console.info(`creating user ${email}`);
      setRegisterDisabled(true);
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        uuidv4()
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
  }, [auth, email, name]);

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

            const callbackUrl = params.get('url');
            if (callbackUrl) {
              window.location.href = callbackUrl;
            }
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
      {info && (
        <Alert severity="info">
          <AlertTitle>Login Info</AlertTitle>
          {info}
        </Alert>
      )}

      <Button color="primary" variant="contained" onClick={googleSignIn}>
        Google Login
      </Button>

      <Typography style={{ marginTop: 20 }}>Login mit Email</Typography>
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
          {isWaitingForMagicLink && (
            <TextField
              id="magicLink"
              label="Login Link aus dem Email"
              variant="standard"
              type="magicLink"
              value={magicLink}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setMagicLink(event.target.value);
              }}
            />
          )}

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
