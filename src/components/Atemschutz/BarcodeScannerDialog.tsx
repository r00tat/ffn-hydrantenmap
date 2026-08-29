'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { findByCode, type AtemschutzGeraet } from '../../common/atemschutz';
import useBarcodeScanner from '../../hooks/useBarcodeScanner';
import GeraetAutocomplete from './GeraetAutocomplete';

export interface BarcodeScannerDialogProps {
  open: boolean;
  /** Der Bestand, in dem gesucht wird. */
  geraete: AtemschutzGeraet[];
  onClose: () => void;
  /**
   * Genau ein Treffer, oder keiner. Bei `geraet === undefined` ist `code` der
   * rohe Scan — der Aufrufer trägt ihn als Flaschennummer ein.
   */
  onPicked: (code: string, geraet?: AtemschutzGeraet) => void;
}

export default function BarcodeScannerDialog({
  open,
  geraete,
  onClose,
  onPicked,
}: BarcodeScannerDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  const [code, setCode] = useState('');
  const [manuell, setManuell] = useState('');

  const treffer = useMemo(
    () => (code ? findByCode(geraete, code) : []),
    [code, geraete],
  );

  // Der Scanner läuft weiter, solange kein Code steht: Ein Fehlscan soll den
  // Dialog nicht sperren.
  const handleDetected = useCallback((next: string) => {
    setCode((prev) => (prev ? prev : next));
  }, []);

  const { videoRef, status, errorMessage } = useBarcodeScanner({
    active: open && !code,
    onDetected: handleDetected,
  });

  const uebernehmen = (geraet?: AtemschutzGeraet) => {
    onPicked(code || manuell.trim(), geraet);
    onClose();
  };

  // Genau ein Treffer: Es gibt nichts zu wählen. Als Effekt und nicht im
  // Render — dort wäre es ein Seiteneffekt, den React 19 im Strict Mode
  // zweimal ausführt.
  useEffect(() => {
    if (open && code && treffer.length === 1) {
      onPicked(code, treffer[0]);
      onClose();
    }
    // `onPicked`/`onClose` bewusst nicht in der Liste: Ein bei jedem Render neu
    // erzeugter Callback des Aufrufers löste den Effekt sonst erneut aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, code, treffer]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('scanner.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {!code && (
            <>
              {status === 'starting' && (
                <Typography variant="body2">{t('scanner.starting')}</Typography>
              )}
              {status === 'unsupported' && (
                <Alert severity="info">{t('scanner.unsupported')}</Alert>
              )}
              {status === 'denied' && (
                <Alert severity="warning">{t('scanner.denied')}</Alert>
              )}
              {status === 'error' && (
                <Alert severity="error">
                  {t('scanner.error')}
                  {errorMessage ? ` (${errorMessage})` : ''}
                </Alert>
              )}
              <Box
                sx={{
                  position: 'relative',
                  display: status === 'running' ? 'block' : 'none',
                }}
              >
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  style={{ width: '100%', borderRadius: 8 }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: '30% 10%',
                    border: '2px solid',
                    borderColor: 'primary.main',
                    borderRadius: 1,
                    pointerEvents: 'none',
                  }}
                />
              </Box>
              {status === 'running' && (
                <Typography variant="body2" color="text.secondary">
                  {t('scanner.hint')}
                </Typography>
              )}
              <GeraetAutocomplete
                label={t('scanner.manual')}
                helperText={t('scanner.manualHint')}
                value={manuell}
                geraete={geraete}
                onTextChange={setManuell}
                // Aus der Liste gewählt: Es gibt nichts mehr aufzulösen, das
                // Gerät steht fest.
                onGeraetChange={(g) => {
                  onPicked(g.nummer ?? g.bezeichnung, g);
                  onClose();
                }}
                onSubmit={(value) => setCode(value)}
              />
            </>
          )}

          {code && treffer.length === 0 && (
            <Alert severity="info">{t('scanner.noMatch', { code })}</Alert>
          )}

          {code && treffer.length > 1 && (
            <>
              <Typography variant="body2">
                {t('scanner.multiple', { count: treffer.length })}
              </Typography>
              <List dense>
                {treffer.map((g) => (
                  <ListItemButton key={g.id} onClick={() => uebernehmen(g)}>
                    <ListItemText
                      primary={`${g.nummer ? `${g.nummer} · ` : ''}${g.bezeichnung}`}
                      secondary={g.feuerwehr}
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('cancel')}</Button>
        {!code && (
          <Button
            variant="contained"
            disabled={!manuell.trim()}
            onClick={() => setCode(manuell.trim())}
          >
            {t('scanner.use')}
          </Button>
        )}
        {code && treffer.length === 0 && (
          <Button variant="contained" onClick={() => uebernehmen()}>
            {t('scanner.use')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
