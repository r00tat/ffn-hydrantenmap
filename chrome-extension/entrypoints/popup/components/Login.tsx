import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { signInWithGoogle } from '@shared/auth';
import { useTranslations } from '@shared/i18n';

export default function Login() {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('login.failed'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 2,
        p: 3,
      }}
    >
      <Typography variant="h5" gutterBottom>
        {t('app.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t('login.intro')}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      )}
      <Button
        variant="contained"
        onClick={handleLogin}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={20} /> : null}
        sx={{ mt: 2 }}
      >
        {loading ? t('login.signingIn') : t('login.signInGoogle')}
      </Button>
    </Box>
  );
}
