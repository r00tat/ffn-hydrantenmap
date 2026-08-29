'use client';

import { useCallback, useRef, useState } from 'react';
import PrintIcon from '@mui/icons-material/Print';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { QRCodeSVG } from 'qrcode.react';
import { useLocale, useTranslations } from 'next-intl';
import type { AtemschutzGeraet } from '../../../common/atemschutz';
import {
  PrintWindowBlockedError,
  printShareLinkQr,
} from '../../Fahrtenbuch/admin/shareLinkQr';

export interface GeraetQrDialogProps {
  open: boolean;
  geraet: AtemschutzGeraet;
  onClose: () => void;
}

/**
 * Etikett für eine Flasche ohne aufgedruckten Barcode.
 *
 * Die Barcode-Spalte des Artikelexports ist in einer von 214 Zeilen gefüllt.
 * Ohne selbst gedruckte Etiketten bliebe der Scanner für den Bestand nutzlos.
 *
 * Der Code trägt die **Flaschennummer im Klartext** (`2.16.19`), nicht die
 * Firestore-ID: Sie steht auch lesbar auf dem Etikett, `lookupKeys` findet sie,
 * und das Etikett überlebt einen Neuimport der Stammdaten.
 *
 * Gedruckt wird über `printShareLinkQr` — dieselbe Mechanik wie beim
 * Fahrtenbuch-Share-Link. Eine `@media print`-Regel im Dialog nähme dessen
 * Overlay- und Scroll-Container mit auf den Ausdruck; deshalb baut jene
 * Funktion ein eigenständiges Dokument in einem neuen Fenster.
 */
export default function GeraetQrDialog({
  open,
  geraet,
  onClose,
}: GeraetQrDialogProps) {
  const t = useTranslations('atemschutz');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const qrRef = useRef<HTMLDivElement>(null);
  const [fehler, setFehler] = useState<'failed' | 'blocked'>();

  const code = geraet.nummer?.trim();

  const drucken = useCallback(() => {
    setFehler(undefined);
    // Das SVG wird aus dem DOM gelesen statt neu erzeugt — so kann ein
    // Ausdruck nie einen anderen Code tragen als der Bildschirm.
    const svg = qrRef.current?.querySelector('svg');
    if (!svg || !code) {
      setFehler('failed');
      return;
    }
    try {
      printShareLinkQr(svg, {
        heading: t('qr.title'),
        groupName: [geraet.bezeichnung, geraet.feuerwehr]
          .filter(Boolean)
          .join(' · '),
        vehicleName: code,
        hint: t('qr.hint'),
        url: code,
        locale,
      });
    } catch (err) {
      console.error('Atemschutz QR print failed:', err);
      setFehler(err instanceof PrintWindowBlockedError ? 'blocked' : 'failed');
    }
  }, [code, geraet.bezeichnung, geraet.feuerwehr, locale, t]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('qr.title')}</DialogTitle>
      <DialogContent>
        {!code ? (
          <Alert severity="warning">{t('qr.noNumber')}</Alert>
        ) : (
          <>
            {/* Weißer Grund, `level="M"` und volle Quiet Zone wie beim
                Share-Link-Code: Das Etikett klebt an einer Flasche und bekommt
                Schmutz und Knicke ab; die Defaults von qrcode.react (`L`,
                `marginSize=0`) sind dafür die schwächste Stufe. */}
            <Box
              ref={qrRef}
              sx={{
                p: 2,
                bgcolor: 'white',
                borderRadius: 1,
                width: 'fit-content',
                mx: 'auto',
              }}
            >
              <QRCodeSVG
                value={code}
                size={200}
                level="M"
                marginSize={4}
                title={code}
              />
            </Box>
            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Typography variant="h6">{code}</Typography>
              <Typography variant="body2" color="text.secondary">
                {geraet.bezeichnung}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {geraet.feuerwehr}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              component="p"
              sx={{ mt: 2 }}
            >
              {t('qr.hint')}
            </Typography>
          </>
        )}
        {fehler && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {fehler === 'blocked' ? t('qr.printBlocked') : t('qr.exportFailed')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tCommon('close')}</Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          disabled={!code}
          onClick={drucken}
        >
          {t('qr.print')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
