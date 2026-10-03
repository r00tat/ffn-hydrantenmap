'use client';

import RefreshIcon from '@mui/icons-material/Refresh';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

/**
 * Rückfallseite des Service Workers für Navigationen, die offline nicht
 * vorgehalten sind (`src/worker/appShell.ts`). Sie wird vorgewärmt und dann
 * unter der ursprünglichen Adresse ausgeliefert — „Erneut versuchen" lädt
 * deshalb genau die Seite neu, die gewünscht war.
 */
export default function OfflinePage() {
  const t = useTranslations('networkStatus');
  return (
    <Paper sx={{ p: 2, m: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <WifiOffIcon color="warning" />
        <Typography variant="h5" component="h1">
          {t('offlinePageTitle')}
        </Typography>
      </Stack>
      <Typography variant="body1" sx={{ mb: 2 }}>
        {t('offlinePageText')}
      </Typography>
      <Stack direction="row" spacing={1}>
        {/* Volle Navigation statt Client-Routing, siehe Test. */}
        <Button variant="contained" href="/">
          {t('offlinePageToMap')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => window.location.reload()}
        >
          {t('offlinePageRetry')}
        </Button>
      </Stack>
    </Paper>
  );
}
