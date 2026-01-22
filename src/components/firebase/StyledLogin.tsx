'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendEmailVerification,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
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
  const [password, setPassword] = useState('');
  const [isWaitingForMagicLink, setIsWaitingForMagicLink] = useState(false);
  const [magicLink, setMagicLink] = useState('');
  const [isEmailLogin, setIsEmailLogin] = useState(false);

  const googleSignIn = useCallback(async () => {
    setError(undefined);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // This gives you a Google Access Token. You can use it to access the Google API.
      // const credential = GoogleAuthProvider.credentialFromResult(result);
      const user = result.user;

      const userInfo = getAdditionalUserInfo(result);

      console.info(`signin success`);
    } catch (err) {
      console.error(`google login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth]);

  const emailSignInWithLink = useCallback(async () => {
    try {
      if (email && magicLink) {
        try {
          const result = await signInWithEmailLink(auth, email, magicLink);
          window.localStorage.removeItem('emailForSignIn');
          console.info(`login result with email link`);
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
        console.info(`sending sign in link`);
        setInfo('Email für den Login versandt. Bitte prüfen Sie Ihre Email.');
        window.localStorage.setItem('emailForSignIn', email);
      }
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth, email, magicLink]);

  const emailSignIn = useCallback(async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      // Signed in
      const user = userCredential.user;
      console.info(`sign in with password success`);
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth, email, password]);

  const signUp = useCallback(async () => {
    try {
      console.info(`creating user`);
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

      console.info(`sign in with password success`);
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
            console.info(`login result with email link`);

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
    <Grid container padding={4}>
      {error && (
        <Grid size={12}>
          <Alert severity="error">
            <AlertTitle>Login fehlgeschlagen</AlertTitle>
            {error}
          </Alert>
        </Grid>
      )}
      {info && (
        <Grid size={12}>
          <Alert severity="info">
            <AlertTitle>Login Info</AlertTitle>
            {info}
          </Alert>
        </Grid>
      )}

      {!registerVisible && (
        <>
          <Grid size={{ xs: 12 }}>
            <form>
              <FormControl>
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
                {!isEmailLogin && (
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={() => setIsEmailLogin(true)}
                    style={{ marginTop: 20 }}
                    disabled={email === '' || email.includes('@') === false}
                  >
                    Login mit Email
                  </Button>
                )}

                {isEmailLogin && (
                  <>
                    <Button
                      color="primary"
                      variant="contained"
                      onClick={emailSignInWithLink}
                      style={{ marginTop: 20 }}
                      disabled={email === '' || email.includes('@') === false}
                    >
                      Login mit Email Link
                    </Button>

                    <TextField
                      id="password"
                      label="Password"
                      variant="standard"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(
                        event: React.ChangeEvent<HTMLInputElement>
                      ) => {
                        setPassword(event.target.value);
                      }}
                    />

                    {isWaitingForMagicLink && (
                      <TextField
                        id="magicLink"
                        label="Login Link aus dem Email"
                        variant="standard"
                        type="magicLink"
                        value={magicLink}
                        onChange={(
                          event: React.ChangeEvent<HTMLInputElement>
                        ) => {
                          setMagicLink(event.target.value);
                        }}
                      />
                    )}

                    <Button
                      color="primary"
                      variant="contained"
                      onClick={emailSignIn}
                      style={{ marginTop: 20 }}
                      disabled={email === '' || password === ''}
                    >
                      Login mit Email &amp; Passwort
                    </Button>
                  </>
                )}
                <Typography>Passwort vergessen?</Typography>
              </FormControl>
            </form>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Button
              color="primary"
              variant="contained"
              onClick={googleSignIn}
              style={{ marginTop: 20 }}
            >
              Mit Google einloggen
            </Button>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Button
              color="secondary"
              variant="contained"
              disabled={registerDisabled}
              onClick={() =>
                registerVisible ? signUp() : setRegisterVisible(true)
              }
              style={{ marginTop: 20 }}
            >
              Als neuer Benutzer registrieren
            </Button>
          </Grid>
        </>
      )}

      {registerVisible && (
        <>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography style={{ marginTop: 20 }} variant="h4">
              Neu Registrieren
            </Typography>
            <form>
              <FormControl>
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

                <TextField
                  id="password"
                  label="Password"
                  variant="standard"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setPassword(event.target.value);
                  }}
                />

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
                <Button
                  color="secondary"
                  variant="contained"
                  disabled={registerDisabled}
                  onClick={() =>
                    registerVisible ? signUp() : setRegisterVisible(true)
                  }
                  style={{ marginTop: 20 }}
                >
                  Mit diesem Namen und Email registrieren
                </Button>

                <Button
                  color="warning"
                  variant="outlined"
                  onClick={() => setRegisterVisible(false)}
                  style={{ marginTop: 20 }}
                >
                  Abbrechen
                </Button>
              </FormControl>
            </form>
          </Grid>
        </>
      )}
    </Grid>
  );
}
