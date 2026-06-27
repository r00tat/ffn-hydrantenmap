'use client';

import WifiOffIcon from '@mui/icons-material/WifiOff';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Snackbar from '@mui/material/Snackbar';
import { useTranslations } from 'next-intl';
import useOfflineSync from '../../hooks/useOfflineSync';
import useOnline from '../../hooks/useOnline';

/**
 * Persistent warning shown while the device has no network connection.
 *
 * Firestore writes made while offline are not synced and are lost on reload,
 * so this stays visible for the whole offline period (no auto-hide) to warn the
 * user that changes may not be saved.
 */
export default function OfflineWarning() {
  const online = useOnline();
  const t = useTranslations('networkStatus');

  // Confirm once offline changes have synced back to the backend.
  useOfflineSync();

  return (
    <Snackbar
      open={!online}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity="warning"
        variant="filled"
        icon={<WifiOffIcon />}
        sx={{ width: '100%' }}
      >
        <AlertTitle>{t('offlineTitle')}</AlertTitle>
        {t('offline')}
      </Alert>
    </Snackbar>
  );
}
