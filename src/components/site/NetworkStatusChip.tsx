'use client';

import CloudSyncIcon from '@mui/icons-material/CloudSync';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import useConnectivity from '../../hooks/useConnectivity';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import { checkConnectivityNow } from '../../lib/connectivity';
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
 *   gegen `/api/ping`, nicht nur `navigator.onLine`). Antippen prüft sofort.
 * - syncing: „N Änderungen werden übertragen…", solange nach dem Reconnect
 *   noch Schreibvorgänge offen sind.
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
          icon={<WifiOffIcon />}
          label={label}
          color="warning"
          size="small"
          onClick={() => {
            void checkConnectivityNow();
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
          icon={<CloudSyncIcon />}
          label={t('syncing', { count: pendingWrites })}
          color="info"
          size="small"
          sx={{
            ml: 1,
            mr: 1,
            flexShrink: 0,
            maxWidth: { xs: 160, sm: 'none' },
            backgroundColor: '#fff',
            color: 'info.main',
            '& .MuiChip-icon': { color: 'info.main' },
          }}
        />
      </Tooltip>
    );
  }

  return null;
}
