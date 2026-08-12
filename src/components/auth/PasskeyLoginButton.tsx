'use client';

import KeyIcon from '@mui/icons-material/Key';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useFirebasePasskeyLogin } from '../../hooks/useFirebasePasskeyLogin';

export default function PasskeyLoginButton() {
  const t = useTranslations('passkey');
  const { login, loading, error } = useFirebasePasskeyLogin();
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    // Erst im Effect, damit Server- und Client-Render identisch bleiben:
    // `browserSupportsWebAuthn()` greift auf `window` zu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (!supported) {
    return null;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Divider sx={{ mb: 2 }}>{t('or')}</Divider>
      <Button
        variant="outlined"
        fullWidth
        startIcon={loading ? <CircularProgress size={18} /> : <KeyIcon />}
        disabled={loading}
        onClick={() => login()}
      >
        {t('loginButton')}
      </Button>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {t('loginFailed')}
        </Alert>
      )}
    </Box>
  );
}
