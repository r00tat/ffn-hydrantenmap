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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { QRCodeSVG } from 'qrcode.react';
import { useLocale, useTranslations } from 'next-intl';
import {
  geraetKennung,
  type AtemschutzGeraet,
} from '../../../common/atemschutz';
import { code128Supported } from '../../../common/code128';
import {
  PrintWindowBlockedError,
  printShareLinkQr,
} from '../../Fahrtenbuch/admin/shareLinkQr';
import Code128Svg from './Code128Svg';

/** Die Codearten, die das Etikett tragen kann. */
type CodeArt = 'qr' | 'code128';

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
 * Der Code trägt die **führende Kennung im Klartext** (`geraetKennung`, also im
 * Regelfall die Inventarnummer), nicht die Firestore-ID: Sie steht auch lesbar
 * auf dem Etikett, `lookupKeys` findet sie, und das Etikett überlebt einen
 * Neuimport der Stammdaten. Ältere Etiketten mit der Flaschennummer bleiben
 * gültig — `lookupKeys` deckt beide Felder ab.
 *
 * **QR oder Code 128**, wählbar am Dialog. QR ist die Vorgabe: Er trägt mehr
 * auf weniger Fläche und verzeiht Knicke. Code 128 gibt es, weil viele
 * Handscanner und Lagergeräte nur Strichcodes lesen und weil er auf ein
 * schmales Flaschenetikett besser passt. Beide liest der Scanner der App —
 * `useBarcodeScanner` hat `CODE_128` in der Formatliste.
 *
 * Gedruckt wird über `printShareLinkQr` — dieselbe Mechanik wie beim
 * Fahrtenbuch-Share-Link. Eine `@media print`-Regel im Dialog nähme dessen
 * Overlay- und Scroll-Container mit auf den Ausdruck; deshalb baut jene
 * Funktion ein eigenständiges Dokument in einem neuen Fenster. Die Codeart
 * geht als `codeShape` mit: Ein Strichcode in ein Quadrat gezwängt wäre so
 * schmal, dass ihn kein Scanner mehr liest.
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
  const [codeArt, setCodeArt] = useState<CodeArt>('qr');

  const code = geraetKennung(geraet)?.trim();
  // Codeset B endet bei `~`. Eine Kennung mit Umlaut ist nicht vorgesehen,
  // aber eintippbar — dann bleibt es beim QR-Code, statt beim Zeichnen zu
  // scheitern.
  const code128Moeglich = !!code && code128Supported(code);
  const zeigeCode128 = codeArt === 'code128' && code128Moeglich;

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
        codeShape: zeigeCode128 ? 'linear' : 'square',
      });
    } catch (err) {
      console.error('Atemschutz QR print failed:', err);
      setFehler(err instanceof PrintWindowBlockedError ? 'blocked' : 'failed');
    }
  }, [code, geraet.bezeichnung, geraet.feuerwehr, locale, t, zeigeCode128]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('qr.title')}</DialogTitle>
      <DialogContent>
        {!code ? (
          <Alert severity="warning">{t('qr.noNumber')}</Alert>
        ) : (
          <>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={zeigeCode128 ? 'code128' : 'qr'}
              onChange={(_, next: CodeArt | null) => next && setCodeArt(next)}
              aria-label={t('qr.codeArt')}
              sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}
            >
              <ToggleButton value="qr">{t('qr.codeArtQr')}</ToggleButton>
              {/* Der `span` trägt die Events des gesperrten Buttons — ohne ihn
                  bliebe der Tooltip stumm. */}
              <Tooltip
                title={code128Moeglich ? '' : t('qr.code128Unmoeglich')}
              >
                <span style={{ display: 'flex' }}>
                  <ToggleButton value="code128" disabled={!code128Moeglich}>
                    {t('qr.codeArtCode128')}
                  </ToggleButton>
                </span>
              </Tooltip>
            </ToggleButtonGroup>

            {/* Weißer Grund, `level="M"` und volle Quiet Zone wie beim
                Share-Link-Code: Das Etikett klebt an einer Flasche und bekommt
                Schmutz und Knicke ab; die Defaults von qrcode.react (`L`,
                `marginSize=0`) sind dafür die schwächste Stufe. Beim Code 128
                steckt die Ruhezone in der `viewBox`. */}
            <Box
              ref={qrRef}
              sx={{
                p: 2,
                bgcolor: 'white',
                borderRadius: 1,
                width: zeigeCode128 ? '100%' : 'fit-content',
                mx: 'auto',
              }}
            >
              {zeigeCode128 ? (
                <Code128Svg value={code} />
              ) : (
                <QRCodeSVG
                  value={code}
                  size={200}
                  level="M"
                  marginSize={4}
                  title={code}
                />
              )}
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
