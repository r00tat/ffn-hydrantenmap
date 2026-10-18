'use client';

import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useRef, useState } from 'react';
import {
  QR_PNG_SIZE,
  serializeQrSvg,
  svgToPngBlob,
} from '../Fahrtenbuch/admin/shareLinkQr';
import { downloadBlob } from '../firebase/download';
import { firecallQrFilename, shareLinkWithQr } from './shareLinkWithQr';

export interface FirecallShareLinkQrProps {
  /** Der Link, den der Code trägt — derselbe, der darüber im Klartext steht. */
  url: string;
  /** Name des Gasts, steckt im Dateinamen des Bilds. */
  guestName?: string;
  /** Name des Einsatzes für den Begleittext beim Teilen. */
  firecallName?: string;
  /** Kopiert den Link — für den Rückfall ohne Teilen-Menü. */
  onCopyLink: (url: string) => Promise<boolean>;
}

type Notice =
  | { kind: 'fallback'; copied: boolean }
  | { kind: 'error'; message: string };

/**
 * QR-Code zum Einsatz-Link samt Teilen und Download. Der Code ist für den
 * Fall gedacht, dass der Gast danebensteht: abscannen statt abtippen. Beide
 * Exporte rastern das SVG aus dem DOM, damit das geteilte Bild nie auf einen
 * anderen Link zeigt als der Bildschirm.
 */
export default function FirecallShareLinkQr({
  url,
  guestName,
  firecallName,
  onCopyLink,
}: FirecallShareLinkQrProps) {
  const t = useTranslations('firecallShare');
  const qrRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const filename = firecallQrFilename(guestName);

  const renderPng = useCallback(async () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) throw new Error('QR code not rendered');
    return await svgToPngBlob(serializeQrSvg(svg), QR_PNG_SIZE);
  }, []);

  const run = useCallback(
    async (action: (png: Blob) => Promise<void>) => {
      setBusy(true);
      setNotice(undefined);
      try {
        await action(await renderPng());
      } catch (err) {
        console.error('Firecall share link QR export failed:', err);
        setNotice({
          kind: 'error',
          message: t('qrError', {
            error: (err as Error)?.message ?? String(err),
          }),
        });
      } finally {
        setBusy(false);
      }
    },
    [renderPng, t]
  );

  const share = () =>
    run(async (png) => {
      const outcome = await shareLinkWithQr({
        url,
        title: t('title'),
        text: firecallName
          ? t('shareText', { name: firecallName })
          : t('shareTextGeneric'),
        qrPng: png,
        filename,
      });
      if (outcome === 'unsupported') {
        // Kein Teilen-Menü (z. B. Firefox am Desktop): Bild und Link landen
        // dort, wo man sie selbst weiterreichen kann.
        await downloadBlob(png, filename);
        setNotice({ kind: 'fallback', copied: await onCopyLink(url) });
      }
    });

  const download = () => run((png) => downloadBlob(png, filename));

  return (
    <>
      {/* Weißer Grund und volle Quiet Zone wie beim Fahrtenbuch-Code: im Dark
          Mode und vom Display abfotografiert sonst schwer lesbar. */}
      <Box
        ref={qrRef}
        sx={{
          p: 2,
          mt: 2,
          mx: 'auto',
          bgcolor: 'white',
          borderRadius: 1,
          width: 'fit-content',
        }}
      >
        <QRCodeSVG
          value={url}
          size={220}
          level="M"
          marginSize={4}
          title={t('qrTitle')}
        />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}
      >
        <Button
          variant="contained"
          disabled={busy}
          startIcon={
            busy ? <CircularProgress size={16} color="inherit" /> : <ShareIcon />
          }
          onClick={share}
        >
          {t('shareQr')}
        </Button>
        <Button disabled={busy} startIcon={<DownloadIcon />} onClick={download}>
          {t('downloadQr')}
        </Button>
      </Stack>
      {notice && (
        <Alert
          severity={notice.kind === 'error' ? 'error' : 'info'}
          sx={{ mt: 1 }}
        >
          {notice.kind === 'error'
            ? notice.message
            : notice.copied
              ? t('shareFallback')
              : t('shareFallbackNoCopy')}
        </Alert>
      )}
    </>
  );
}
