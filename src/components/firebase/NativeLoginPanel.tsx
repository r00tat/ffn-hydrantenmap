'use client';

import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';
import { auth } from './firebase';
import GoogleSignInButton from './GoogleSignInButton';
import { signInWithGoogle } from './googleAuthAdapter';

export default function NativeLoginPanel() {
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const onGoogle = useCallback(async () => {
    setError(undefined);
    setIsSigningIn(true);
    try {
      await signInWithGoogle(auth);
    } catch (err) {
      console.error('native google login failed', err);
      setError((err as Error).message || String(err));
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Alert severity="info" variant="outlined">
        <Typography variant="body2">
          Nativer Login erkannt (Capacitor / Android).
        </Typography>
      </Alert>
      <GoogleSignInButton
        onClick={onGoogle}
        label={isSigningIn ? 'Android Login …' : 'Android Login'}
      />
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
