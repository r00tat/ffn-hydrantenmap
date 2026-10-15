'use client';

import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Button from '@mui/material/Button';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import LinearProgressWithLabel from '../inputs/LinearProgressWithLabel';
import { useSnackbar } from '../providers/SnackbarProvider';
import { createDriveUploadSessions } from './driveFileActions';
import { uploadFilesToDrive } from './uploadFilesToDrive';
import OnlineOnly from '../site/OnlineOnly';

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

export interface DriveFileUploaderProps {
  firecallId: string;
  onUploadComplete: () => void;
}

export default function DriveFileUploader({
  firecallId,
  onUploadComplete,
}: DriveFileUploaderProps) {
  const t = useTranslations('einsatzDrive');
  const showSnackbar = useSnackbar();
  const [uploading, setUploading] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});

  const handleUpload = useCallback(
    async (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setUploading(true);
      setNames(files.map((f) => f.name));
      setProgress({});
      try {
        const { uploaded, failed } = await uploadFilesToDrive(firecallId, files, {
          createSessions: createDriveUploadSessions,
          onProgress: (index, percent) =>
            setProgress((prev) => ({ ...prev, [index]: percent })),
        });
        if (failed > 0) {
          showSnackbar(t('uploadFailed', { count: failed }), 'error');
        }
        if (uploaded > 0) {
          onUploadComplete();
        }
      } finally {
        setUploading(false);
      }
    },
    [firecallId, onUploadComplete, showSnackbar, t],
  );

  return (
    <>
      {/* Der Upload braucht eine Upload-Sitzung vom Server und Google Drive —
          offline nicht möglich, und eine Sitzung lässt sich nicht vorhalten. */}
      <OnlineOnly>
        <Button
          component="label"
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          disabled={uploading}
        >
          {t('uploadButton')}
          <VisuallyHiddenInput
            type="file"
            multiple
            onChange={(event) => {
              (async () => {
                if (event.target.files) {
                  await handleUpload(event.target.files);
                  event.target.value = '';
                }
              })();
            }}
          />
        </Button>
      </OnlineOnly>
      {uploading && (
        <>
          <Typography>{t('uploading')}</Typography>
          {names.map((name, index) => (
            <LinearProgressWithLabel
              key={index}
              value={progress[index] ?? 0}
              label={name}
            />
          ))}
        </>
      )}
    </>
  );
}
