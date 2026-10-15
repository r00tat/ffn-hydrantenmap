'use client';

import CloudSyncIcon from '@mui/icons-material/CloudSync';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import useConnectivity from '../../hooks/useConnectivity';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { retrySyncNow } from '../../lib/syncRetry';
import SyncErrorsChip from './SyncErrorsChip';

/**
 * So lange muss `syncing` anstehen, bevor der Chip es zeigt. Online ist jeder
 * Schreibvorgang für einen Augenblick unbestätigt; ohne Verzögerung blitzte der
 * Chip bei jedem Speichern auf.
 */
export const SYNCING_DISPLAY_DELAY_MS = 1_500;

function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setDelayed(false);
    };
  }, [flag, delayMs]);
  return flag && delayed;
}

/**
 * Dauerhafte Anzeige des Verbindungsstatus in der HeaderBar.
 *
 * - offline: „Offline-Modus", solange der Server nicht erreichbar ist (Ping
 *   gegen `/api/ping`, nicht nur `navigator.onLine`).
 * - syncing: „N Änderungen werden übertragen…", solange nach dem Reconnect
 *   noch Schreibvorgänge offen sind.
 *
 * Antippen startet in beiden Fällen einen Synchronisationsversuch
 * (`retrySyncNow`): Ping, Anmeldung erneuern, Firestore neu verbinden,
 * Warteschlange abarbeiten. Solange er läuft, dreht sich das Symbol.
 * - online: nichts.
 *
 * Daneben, unabhängig vom Zustand: `SyncErrorsChip`, sobald der Server
 * Änderungen beim Synchronisieren abgelehnt hat.
 *
 * Ersetzt die frühere Snackbar (`OfflineWarning`), die oben mittig Inhalte
 * verdeckte. Die Bestätigung „Änderungen wurden synchronisiert" kommt weiter
 * als Snackbar aus `useOfflineSync`.
 */
export default function NetworkStatusChip() {
  return (
    <>
      <ConnectivityChip />
      <SyncErrorsChip />
    </>
  );
}

function ConnectivityChip() {
  const t = useTranslations('networkStatus');
  const { status, pendingWrites } = useConnectivity();
  const { offlineAuth } = useFirebaseLogin();
  const showSyncing = useDelayedFlag(
    status === 'syncing',
    SYNCING_DISPLAY_DELAY_MS,
  );
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await retrySyncNow();
    } finally {
      setRetrying(false);
    }
  }, []);
  const spinner = <CircularProgress size={14} color="inherit" />;

  if (status === 'offline') {
    const label =
      pendingWrites > 0
        ? t('offlinePending', { count: pendingWrites })
        : t('offlineMode');
    return (
      <Tooltip
        title={
          offlineAuth
            ? `${t('offlineHint')} ${t('offlineAuthHint')}`
            : t('offlineHint')
        }
      >
        <Chip
          icon={retrying ? spinner : <WifiOffIcon />}
          label={label}
          color="warning"
          size="small"
          onClick={() => {
            void retry();
          }}
          sx={{ ml: 1, mr: 1, flexShrink: 0, maxWidth: { xs: 160, sm: 'none' } }}
        />
      </Tooltip>
    );
  }

  if (showSyncing) {
    return (
      <Tooltip title={t('syncingHint')}>
        <Chip
          icon={retrying ? spinner : <CloudSyncIcon />}
          label={t('syncing', { count: pendingWrites })}
          color="info"
          size="small"
          onClick={() => {
            void retry();
          }}
          sx={{
            ml: 1,
            mr: 1,
            flexShrink: 0,
            maxWidth: { xs: 160, sm: 'none' },
            backgroundColor: '#fff',
            '&:hover, &.Mui-focusVisible': { backgroundColor: 'grey.100' },
            color: 'info.main',
            '& .MuiChip-icon': { color: 'info.main' },
          }}
        />
      </Tooltip>
    );
  }

  return null;
}
