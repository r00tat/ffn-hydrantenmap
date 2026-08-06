'use client';

import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useRef, useState } from 'react';
import {
  PrintWindowBlockedError,
  downloadShareLinkQr,
  printShareLinkQr,
} from './shareLinkQr';

export interface ShareLinkQrBlockProps {
  /** Der Link, den der Code trägt — immer der, der auch am Bildschirm steht. */
  url: string;
  /** Steckt im Dateinamen des PNG-Exports. */
  groupId: string;
  /** Erscheint auf dem Ausdruck, damit der Zettel zuordenbar bleibt. */
  groupName?: string;
  /** Vorbelegtes Fahrzeug; entfällt beim allgemeinen Link der Gruppe. */
  vehicleName?: string;
}

/** Warum ein Export scheiterte — der Pop-up-Blocker braucht einen eigenen Rat. */
type ExportError = 'failed' | 'blocked';

/**
 * QR-Code samt Download und Ausdruck. Eigene Komponente, weil derselbe Block an
 * zwei Stellen steht: beim Gruppen-Link und beim einzelnen Fahrzeug. Beide
 * Exporte lesen das SVG aus dem DOM statt den Code neu zu erzeugen — so kann
 * ein Ausdruck nie auf einen anderen Link zeigen als der Bildschirm.
 */
export default function ShareLinkQrBlock({
  url,
  groupId,
  groupName,
  vehicleName,
}: ShareLinkQrBlockProps) {
  const t = useTranslations('fahrtenbuch.shareLink');
  const locale = useLocale();
  const qrRef = useRef<HTMLDivElement>(null);
  const [exportError, setExportError] = useState<ExportError>();

  const runExport = useCallback(
    async (action: (svg: SVGSVGElement) => void | Promise<void>) => {
      setExportError(undefined);
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) {
        setExportError('failed');
        return;
      }
      try {
        await action(svg);
      } catch (err) {
        console.error('Fahrtenbuch share link QR export failed:', err);
        setExportError(
          err instanceof PrintWindowBlockedError ? 'blocked' : 'failed',
        );
      }
    },
    [],
  );

  return (
    <>
      {/* Weißer Grund: ein QR-Code auf dunklem Hintergrund ist im Dark Mode für
          Scanner unbrauchbar. `level="M"` und eine volle Quiet Zone von 4
          Modulen, weil der Ausdruck am Fahrzeug Sonne, Schmutz und Knicke
          abbekommt — die Defaults von qrcode.react (`L`, `marginSize=0`) sind
          dafür die schwächste Stufe. */}
      <Box
        ref={qrRef}
        sx={{
          p: 2,
          mt: 1,
          bgcolor: 'white',
          borderRadius: 1,
          width: 'fit-content',
        }}
      >
        <QRCodeSVG
          value={url}
          size={200}
          level="M"
          marginSize={4}
          title={t('heading')}
        />
      </Box>
      {exportError && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {exportError === 'blocked' ? t('printBlocked') : t('exportFailed')}
        </Alert>
      )}
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mt: 1, flexWrap: 'wrap' }}
      >
        <Button
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() =>
            runExport((svg) => downloadShareLinkQr(svg, groupId, vehicleName))
          }
        >
          {t('download')}
        </Button>
        <Button
          size="small"
          startIcon={<PrintIcon />}
          onClick={() =>
            runExport((svg) =>
              printShareLinkQr(svg, {
                heading: t('heading'),
                groupName,
                vehicleName,
                hint: t('printHint'),
                url,
                locale,
              }),
            )
          }
        >
          {t('print')}
        </Button>
      </Stack>
    </>
  );
}
