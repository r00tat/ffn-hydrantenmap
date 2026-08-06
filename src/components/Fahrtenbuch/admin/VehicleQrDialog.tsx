'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  shareLinkUrlWithVehicle,
  type ShareLinkInfo,
} from '../../../common/fahrtenbuchShare';
import { getFahrtenbuchShareLink } from '../shareLinkActions';
import ShareLinkQrBlock from './ShareLinkQrBlock';

export interface VehicleQrDialogProps {
  groupId: string;
  /** Erscheint auf dem Ausdruck. */
  groupName?: string;
  vehicle: { id: string; name: string };
  onClose: () => void;
}

/**
 * Der QR-Code eines einzelnen Fahrzeugs — der Aufkleber, der im Fahrzeug
 * klebt. Der Link ist derselbe wie der der Gruppe, nur mit der
 * Fahrzeug-Vorauswahl.
 *
 * Erzeugen, Neuerzeugen und Widerrufen bleiben bewusst in `ShareLinkSection`:
 * Diese Aktionen treffen alle Fahrzeuge gleichzeitig, und ein „Neu erzeugen"
 * neben dem Code eines einzelnen Fahrzeugs sähe aus, als beträfe es nur dieses.
 */
export default function VehicleQrDialog({
  groupId,
  groupName,
  vehicle,
  onClose,
}: VehicleQrDialogProps) {
  const t = useTranslations('fahrtenbuch.shareLink');
  const [link, setLink] = useState<ShareLinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  /**
   * Ein Ladefehler darf nicht wie „kein Link vorhanden" aussehen — sonst hält
   * der Admin einen bestehenden Link für nicht erzeugt und legt ihn neu an,
   * womit jeder schon klebende Aufkleber tot ist.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setLink(await getFahrtenbuchShareLink(groupId));
    } catch (err) {
      console.error('Failed to load Fahrtenbuch share link:', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const url = link ? shareLinkUrlWithVehicle(link.url, vehicle.id) : '';

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('vehicleQrTitle', { vehicle: vehicle.name })}</DialogTitle>
      <DialogContent>
        {loading ? (
          <CircularProgress size={20} />
        ) : loadFailed ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={load}>
                {t('retry')}
              </Button>
            }
          >
            {t('loadFailed')}
          </Alert>
        ) : !link ? (
          // Kein Code ohne Link: ein QR-Code auf eine leere URL ließe sich
          // ausdrucken und ankleben und wäre schlimmer als keiner.
          <Alert severity="info">{t('vehicleNoLink')}</Alert>
        ) : (
          <>
            <ShareLinkQrBlock
              url={url}
              groupId={groupId}
              groupName={groupName}
              vehicleName={vehicle.name}
            />
            {/* Der Link im Klartext — die Rückfallebene, wenn das Scannen am
                Fahrzeug scheitert. */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1, display: 'block', wordBreak: 'break-all' }}
            >
              {url}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
