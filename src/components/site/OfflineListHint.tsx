'use client';

import CloudOffIcon from '@mui/icons-material/CloudOff';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { useTranslations } from 'next-intl';
import useConnectivity from '../../hooks/useConnectivity';

export interface OfflineListHintProps {
  /** `snapshot.metadata.fromCache` der Liste. */
  fromCache: boolean;
  /** Ist die Liste leer? */
  empty: boolean;
}

/**
 * Kennzeichnet eine Liste, die offline nur aus dem lokalen Cache kommt.
 *
 * Eine nie geladene Abfrage liefert offline eine **leere Liste statt eines
 * Fehlers** — für den Benutzer nicht von „es gibt keine Einträge" zu
 * unterscheiden. Leer und aus dem Cache: deutlicher Hinweis. Gefüllt und aus
 * dem Cache: knapper Chip, weil Einträge anderer Geräte fehlen können.
 *
 * Nur im Offline-Zustand des Verbindungsstatus: Online ist ein Ergebnis aus
 * dem Cache der kurze Moment vor der Antwort des Servers und kein Grund für
 * einen Hinweis.
 */
export default function OfflineListHint({
  fromCache,
  empty,
}: OfflineListHintProps) {
  const t = useTranslations('networkStatus');
  const { status } = useConnectivity();

  if (!fromCache || status !== 'offline') return null;

  if (empty) {
    return (
      <Alert severity="info" icon={<CloudOffIcon />} sx={{ my: 1 }}>
        {t('offlineListEmpty')}
      </Alert>
    );
  }

  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<CloudOffIcon />}
      label={t('offlineListIncomplete')}
      sx={{ my: 1 }}
    />
  );
}
