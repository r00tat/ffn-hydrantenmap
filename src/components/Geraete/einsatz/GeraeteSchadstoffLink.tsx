'use client';

import Inventory2Icon from '@mui/icons-material/Inventory2';
import Button from '@mui/material/Button';
import { useTranslations } from 'next-intl';
import { useFirecallId } from '../../../hooks/useFirecall';
import FirecallLink from '../../site/FirecallLink';

/**
 * Verweis von der Schadstoff-Seite auf den Einsatz-Abschnitt „Geräte &
 * Material": Schutzanzüge, Filter und Bindemittel werden dort verbraucht, wo
 * die Schadstofflage bearbeitet wird. Ohne Einsatz kein Verweis.
 */
export default function GeraeteSchadstoffLink() {
  const t = useTranslations('geraetEinsatz');
  const firecallId = useFirecallId();
  if (!firecallId || firecallId === 'unknown') return null;
  return (
    <Button
      component={FirecallLink}
      href={`/einsatz/${firecallId}/geraete`}
      variant="outlined"
      startIcon={<Inventory2Icon />}
      sx={{ mb: 2 }}
    >
      {t('schadstoffLink')}
    </Button>
  );
}
