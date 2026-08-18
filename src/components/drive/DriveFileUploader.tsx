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
import { uploadToDriveSession } from './uploadToDriveSession';

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
  const [progress, setProgress] = useState<Record<string, number>>({});

  const handleUpload = useCallback(
    async (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      setUploading(true);
      setProgress({});
      try {
        const sessions = await createDriveUploadSessions(
          firecallId,
          files.map((f) => ({
            name: f.name,
            mimeType: f.type || 'application/octet-stream',
            size: f.size,
          })),
        );
        const settled = await Promise.allSettled(
          sessions.map((session, index) =>
            uploadToDriveSession(
              session.uploadUrl,
              files[index],
              (loaded, total) =>
                setProgress((prev) => ({
                  ...prev,
                  [session.name]: total > 0 ? (loaded / total) * 100 : 0,
                })),
            ),
          ),
        );
        const failed = settled.filter((s) => s.status === 'rejected');
        if (failed.length > 0) {
          failed.forEach((f) =>
            console.error(
              'drive upload failed',
              (f as PromiseRejectedResult).reason,
            ),
          );
          showSnackbar(t('uploadFailed', { count: failed.length }), 'error');
        }
        if (failed.length < settled.length) {
          onUploadComplete();
        }
      } catch (err) {
        console.error('could not start drive upload', err);
        showSnackbar(t('uploadStartFailed'), 'error');
      } finally {
        setUploading(false);
      }
    },
    [firecallId, onUploadComplete, showSnackbar, t],
  );

  return (
    <>
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
      {uploading && (
        <>
          <Typography>{t('uploading')}</Typography>
          {Object.entries(progress).map(([name, value]) => (
            <LinearProgressWithLabel key={name} value={value} label={name} />
          ))}
        </>
      )}
    </>
  );
}
