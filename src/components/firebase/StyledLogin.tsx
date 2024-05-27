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
} from 'firebase/auth';
import { useCallback, useState } from 'react';

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
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      // Signed in
      const user = userCredential.user;
      console.info(`sign in with password`, user);
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth, email, password]);
  const signUp = useCallback(async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      // Signed in
      const user = userCredential.user;
      console.info(`sign in with password`, user);
    } catch (err) {
      console.error(`login failed`, err);
      setError((err as any).message || `${err}`);
    }
  }, [auth, email, password]);

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
          <Button
            color="primary"
            variant="contained"
            onClick={emailSignIn}
            style={{ marginTop: 20 }}
          >
            Login
          </Button>
          <Button
            color="secondary"
            variant="contained"
            onClick={signUp}
            style={{ marginTop: 20 }}
          >
            Neu registrieren
          </Button>
        </FormControl>
      </form>
    </Box>
  );
}
