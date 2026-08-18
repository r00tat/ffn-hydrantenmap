'use client';

import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { FirecallDriveState } from '../../common/drive';
import useFirebaseLogin from '../../hooks/useFirebaseLogin';
import useFirecallWriteAccess from '../../hooks/useFirecallWriteAccess';
import DriveFileUploader from './DriveFileUploader';
import { getFirecallDriveState } from './driveFileActions';

/**
 * Zweiter Ablageort neben den Anhängen: Dateien landen in voller Größe im
 * Google Drive der Feuerwehr. Eigene Komponente statt weiterer Code in
 * `EinsatzDetails.tsx` — die Datei ist bereits groß genug.
 */
interface DriveStateResult {
  state?: FirecallDriveState;
  error?: string;
}

/**
 * Laden ohne Zustand: so kann sowohl der erste Effekt als auch das Neuladen
 * nach einem Upload dieselbe Abfrage benutzen, ohne dass in einem Effekt
 * synchron `setState` gerufen wird (`react-hooks/set-state-in-effect`).
 */
async function loadDriveState(firecallId: string): Promise<DriveStateResult> {
  try {
    return { state: await getFirecallDriveState(firecallId) };
  } catch (err) {
    console.error('could not load drive state', err);
    return { error: (err as Error).message };
  }
}

export default function EinsatzDriveFotos({
  firecallId,
}: {
  firecallId: string;
}) {
  const t = useTranslations('einsatzDrive');
  const { isAdmin } = useFirebaseLogin();
  const canWrite = useFirecallWriteAccess();
  const [state, setState] = useState<FirecallDriveState>();
  const [error, setError] = useState<string>();

  const apply = useCallback(({ state, error }: DriveStateResult) => {
    setState(state);
    setError(error);
  }, []);

  const reload = useCallback(async () => {
    apply(await loadDriveState(firecallId));
  }, [apply, firecallId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await loadDriveState(firecallId);
      // Ein Ergebnis für einen anderen Einsatz darf nicht mehr ankommen.
      if (active) apply(result);
    })();
    return () => {
      active = false;
    };
  }, [apply, firecallId]);

  if (error) {
    return <Alert severity="error">{t('loadFailed', { message: error })}</Alert>;
  }
  if (!state) {
    return <CircularProgress size={24} sx={{ mt: 2 }} />;
  }
  // Ein Abschnitt, der nichts kann und nichts erklärt, ist schlimmer als keiner.
  if (!state.configured && !isAdmin) {
    return null;
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {t('explanation', { folder: state.folderName })}
      </Typography>

      {!state.configured ? (
        <Alert severity="info">
          {t('notConfigured')}{' '}
          <Link href="/admin/drive">{t('notConfiguredLink')}</Link>
        </Alert>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {canWrite && (
              <DriveFileUploader
                firecallId={firecallId}
                onUploadComplete={reload}
              />
            )}
            {state.folderUrl && (
              <Button
                startIcon={<FolderOpenIcon />}
                href={state.folderUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('openFolder', { count: state.files.length })}
              </Button>
            )}
          </Box>

          {state.files.length === 0 ? (
            <Typography color="text.secondary">{t('noFiles')}</Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(3, 1fr)',
                  md: 'repeat(4, 1fr)',
                  lg: 'repeat(6, 1fr)',
                },
                gap: 2,
              }}
            >
              {state.files.map((file) => (
                <Link
                  key={file.id}
                  href={file.webViewLink ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ textAlign: 'center' }}
                >
                  {file.mimeType.startsWith('image/') ||
                  file.mimeType.startsWith('video/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/einsatz/${firecallId}/drive/${file.id}/thumbnail`}
                      alt={file.name}
                      loading="lazy"
                      style={{
                        maxWidth: '100%',
                        maxHeight: 160,
                        width: 'auto',
                        height: 'auto',
                      }}
                    />
                  ) : null}
                  <Typography variant="caption" component="div" noWrap>
                    {file.name}
                  </Typography>
                </Link>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
