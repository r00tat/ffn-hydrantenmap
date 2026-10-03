'use client';

import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { DriveFile } from '../../../common/drive';
import { getFirecallDriveState } from '../../drive/driveFileActions';
import { downloadBlob } from '../../firebase/download';
import { downloadStorageFile } from '../../inputs/storageFile';
import { useSnackbar } from '../../providers/SnackbarProvider';
import type { AttachmentRef } from './sybosExtras';

/**
 * Lädt eine Drive-Datei über den Server und speichert sie unter ihrem Namen.
 *
 * Über `fetch` + `downloadBlob` statt eines `<a download>`: In der
 * Android-App ignoriert die WebView das Attribut, `downloadBlob` geht dort über
 * das Teilen-Menü.
 */
async function downloadDriveFile(firecallId: string, file: DriveFile) {
  const res = await fetch(`/api/einsatz/${firecallId}/drive/${file.id}/download`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await downloadBlob(await res.blob(), file.name);
}

function DownloadButton({ label, onDownload }: { label: string; onDownload: () => Promise<void> }) {
  const t = useTranslations('sybos');
  const showSnackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    try {
      await onDownload();
    } catch (err) {
      console.error('download failed', err);
      showSnackbar(t('downloadFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="small"
      startIcon={busy ? <CircularProgress size={16} /> : <DownloadIcon />}
      onClick={click}
      disabled={busy}
    >
      {label}
    </Button>
  );
}

/**
 * Nacheinander statt gleichzeitig: Browser fragen bei vielen parallelen
 * Downloads nach oder verwerfen sie, und Drive-Dateien laufen über unseren
 * Server.
 */
async function downloadAll(tasks: (() => Promise<void>)[]) {
  for (const task of tasks) {
    await task();
  }
}

export function AttachmentList({ attachments }: { attachments: AttachmentRef[] }) {
  const t = useTranslations('sybos');
  if (attachments.length === 0) return null;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {t('anhaenge')}
        </Typography>
        {attachments.length > 1 && (
          <DownloadButton
            label={t('downloadAll')}
            onDownload={() => downloadAll(attachments.map((a) => () => downloadStorageFile(a.url)))}
          />
        )}
      </Box>
      {attachments.map((a) => (
        <Box
          key={`${a.source}|${a.url}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
        >
          <InsertDriveFileIcon fontSize="small" color="action" />
          <Typography variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-word' }}>
            {a.name}
            {a.source && (
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}
                ({a.source})
              </Typography>
            )}
          </Typography>
          <DownloadButton label={t('download')} onDownload={() => downloadStorageFile(a.url)} />
        </Box>
      ))}
    </Box>
  );
}

export function DriveFiles({ firecallId }: { firecallId: string }) {
  const t = useTranslations('sybos');
  const [files, setFiles] = useState<DriveFile[]>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const state = await getFirecallDriveState(firecallId);
        if (active) setFiles(state.files);
      } catch (err) {
        console.error('could not load drive files', err);
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [firecallId]);

  const download = useCallback(
    (file: DriveFile) => () => downloadDriveFile(firecallId, file),
    [firecallId],
  );

  if (error) return <Alert severity="warning">{t('driveFailed')}</Alert>;
  if (!files) return <CircularProgress size={24} />;
  if (files.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {t('fotos')}
        </Typography>
        {files.length > 1 && (
          <DownloadButton
            label={t('downloadAll')}
            onDownload={() => downloadAll(files.map(download))}
          />
        )}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
        }}
      >
        {files.map((file) => (
          <Box key={file.id} sx={{ textAlign: 'center' }}>
            {file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/einsatz/${firecallId}/drive/${file.id}/thumbnail`}
                alt={file.name}
                loading="lazy"
                style={{ maxWidth: '100%', maxHeight: 140, width: 'auto', height: 'auto' }}
              />
            ) : (
              <InsertDriveFileIcon fontSize="large" color="action" />
            )}
            <Typography variant="caption" component="div" noWrap title={file.name}>
              {file.name}
            </Typography>
            <DownloadButton label={t('download')} onDownload={download(file)} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
