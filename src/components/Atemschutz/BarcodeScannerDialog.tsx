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
import {
  findByCode,
  geraetKennung,
  geraetLabel,
  matchedFields,
  type AtemschutzGeraet,
  type KennungFeld,
} from '../../common/atemschutz';
import useBarcodeScanner, {
  type BarcodeScanEvent,
} from '../../hooks/useBarcodeScanner';
import GeraetAutocomplete from './GeraetAutocomplete';
import ScanHinweis, { ScanLauf } from './ScanHinweis';

export interface BarcodeScannerDialogProps {
  open: boolean;
  /** Der Bestand, in dem gesucht wird. */
  geraete: AtemschutzGeraet[];
  onClose: () => void;
  /**
   * Genau ein Treffer, oder keiner. Bei `geraet === undefined` ist `code` der
   * rohe Scan — der Aufrufer trägt ihn als Flaschennummer ein.
   *
   * `scan` steht nur, wenn der Code von der Kamera kam, und reist mit, damit
   * der Folgedialog zeigen kann, was tatsächlich gelesen wurde. Bei einem
   * eindeutigen Treffer schließt sich dieser Dialog sofort — dort ist es die
   * einzige Stelle, an der die Rohlesung noch sichtbar werden kann.
   */
  onPicked: (
    code: string,
    geraet?: AtemschutzGeraet,
    scan?: BarcodeScanEvent,
  ) => void;
}

export default function BarcodeScannerDialog({
  open,
  geraete,
  onClose,
  onPicked,
}: BarcodeScannerDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');

  // Bleibt eine Auswahl übrig, muss dabeistehen, *warum* jedes Stück in der
  // Liste ist: Ein Treffer über die Inventarnummer wiegt anders als einer über
  // eine Seriennummer, in der eine fremde Inventarnummer erfasst wurde.
  const feldLabel: Record<KennungFeld, string> = {
    barcodes: t('scanner.fieldBarcodes'),
    nummer: t('scanner.fieldNummer'),
    inventarNr: t('scanner.fieldInventarNr'),
    zusatzInventarNr: t('scanner.fieldZusatzInventarNr'),
    seriennummer: t('scanner.fieldSeriennummer'),
    externeId: t('scanner.fieldExterneId'),
  };

  const [code, setCode] = useState('');
  const [manuell, setManuell] = useState('');
  // Bleibt leer, wenn von Hand eingegeben wurde — dann gibt es keine Rohlesung,
  // über die man etwas aussagen könnte.
  const [scan, setScan] = useState<BarcodeScanEvent>();

  const treffer = useMemo(
    () => (code ? findByCode(geraete, code) : []),
    [code, geraete],
  );

  // Der Scanner läuft weiter, solange kein Code steht: Ein Fehlscan soll den
  // Dialog nicht sperren.
  const handleDetected = useCallback((next: BarcodeScanEvent) => {
    // Beide behalten den ersten Treffer, damit Code und Rohlesung nie
    // auseinanderlaufen.
    setCode((prev) => (prev ? prev : next.value));
    setScan((prev) => prev ?? next);
  }, []);

  const { videoRef, status, errorMessage, engine, frameSize, frames } =
    useBarcodeScanner({
      active: open && !code,
      onDetected: handleDetected,
    });

  const uebernehmen = (geraet?: AtemschutzGeraet) => {
    onPicked(code || manuell.trim(), geraet, scan);
    onClose();
  };

  // Genau ein Treffer: Es gibt nichts zu wählen. Als Effekt und nicht im
  // Render — dort wäre es ein Seiteneffekt, den React 19 im Strict Mode
  // zweimal ausführt.
  useEffect(() => {
    if (open && code && treffer.length === 1) {
      onPicked(code, treffer[0], scan);
      onClose();
    }
    // `onPicked`/`onClose` bewusst nicht in der Liste: Ein bei jedem Render neu
    // erzeugter Callback des Aufrufers löste den Effekt sonst erneut aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, code, treffer, scan]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('scanner.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {scan && <ScanHinweis scan={scan} />}
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
                <>
                  <Typography variant="body2" color="text.secondary">
                    {t('scanner.hint')}
                  </Typography>
                  <ScanLauf
                    engine={engine}
                    frameSize={frameSize}
                    frames={frames}
                  />
                </>
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
                  onPicked(geraetKennung(g) ?? g.bezeichnung, g, undefined);
                  onClose();
                }}
                // Ein externer Handscanner tippt den Code in dieses Feld und
                // schickt ein Enter hinterher. Trifft der Code eine Kennung
                // exakt, geht es den gewohnten Weg — der klärt auch den Fall,
                // dass mehrere Stücke denselben Code tragen. Sonst wird der
                // oberste Vorschlag genommen: Er ist das, was am Bildschirm
                // ganz oben steht, und ein zweiter Handgriff mit Handschuhen
                // ist genau das, was der Scanner ersparen soll.
                onSubmit={(value, vorschlaege) => {
                  if (findByCode(geraete, value).length > 0 || vorschlaege.length === 0) {
                    setCode(value);
                    return;
                  }
                  onPicked(value, vorschlaege[0], undefined);
                  onClose();
                }}
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
                      primary={geraetLabel(g)}
                      secondary={[
                        g.feuerwehr,
                        t('scanner.matchedBy', {
                          fields: matchedFields(g, code)
                            .map((f) => feldLabel[f])
                            .join(', '),
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      slotProps={{ primary: { variant: 'h6' } }}
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
