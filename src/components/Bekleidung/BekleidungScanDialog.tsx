'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import useBarcodeScanner, { type BarcodeScanEvent } from '../../hooks/useBarcodeScanner';

export interface BekleidungScanDialogProps {
  open: boolean;
  onClose: () => void;
  /** Der gelesene oder eingetippte Code; die Suche macht der Aufrufer. */
  onCode: (code: string) => void;
}

/**
 * Tag-Nummer eines Bekleidungsstücks lesen — Bauweise wie der
 * `GeraetScanDialog`: Kamera über `useBarcodeScanner`, ein Handscanner tippt
 * ins Textfeld und schickt ein Enter hinterher. Das Stück sucht der Aufrufer
 * (`findStueckByCode`).
 */
export default function BekleidungScanDialog({ open, onClose, onCode }: BekleidungScanDialogProps) {
  const t = useTranslations('bekleidung.scanner');
  const [manual, setManual] = useState('');
  const done = useRef(false);

  const finish = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || done.current) return;
      done.current = true;
      // Der Dialog bleibt montiert; der nächste Scan beginnt mit leerem Feld.
      setManual('');
      onCode(trimmed);
      onClose();
    },
    [onCode, onClose],
  );

  const handleDetected = useCallback(
    (scan: BarcodeScanEvent) => finish(scan.value),
    [finish],
  );

  const { videoRef, status, errorMessage } = useBarcodeScanner({
    active: open,
    onDetected: handleDetected,
  });

  // Jedes Öffnen nimmt wieder genau einen Code an.
  useEffect(() => {
    if (open) done.current = false;
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {status === 'starting' && (
            <Typography variant="body2">{t('starting')}</Typography>
          )}
          {status === 'unsupported' && <Alert severity="info">{t('unsupported')}</Alert>}
          {status === 'denied' && <Alert severity="warning">{t('denied')}</Alert>}
          {status === 'error' && (
            <Alert severity="error">
              {t('error')}
              {errorMessage ? ` (${errorMessage})` : ''}
            </Alert>
          )}
          <Box sx={{ display: status === 'running' ? 'block' : 'none' }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', borderRadius: 8 }}
            />
            <Typography variant="body2" color="text.secondary">
              {t('hint')}
            </Typography>
          </Box>
          <TextField
            label={t('manual')}
            helperText={t('manualHint')}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                finish(manual);
              }
            }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
        <Button onClick={() => finish(manual)} disabled={!manual.trim()}>
          {t('use')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
