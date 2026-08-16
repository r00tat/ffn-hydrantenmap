'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Portal from '@mui/material/Portal';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

export interface ScreenshotCaptureOverlayProps {
  open: boolean;
  onCancel: () => void;
}

/**
 * Shown while the bug-report dialog is hidden for a screenshot.
 *
 * Without it the dialog just vanishes: users assume it closed, navigate away
 * and lose their report (#662). The overlay names what is happening, blocks
 * interaction for the moment it takes, and always offers a way back.
 *
 * It is excluded from the capture itself via `data-skip-screenshot` — see the
 * filter in `captureScreenshot.ts`.
 */
export default function ScreenshotCaptureOverlay({
  open,
  onCancel,
}: ScreenshotCaptureOverlayProps) {
  const t = useTranslations('bugReport');

  if (!open) return null;

  return (
    <Portal>
      <Box
        data-skip-screenshot="true"
        sx={{
          position: 'fixed',
          inset: 0,
          // Above the (hidden) dialog and any map overlay.
          zIndex: (theme) => theme.zIndex.modal + 10,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          p: 2,
          bgcolor: 'rgba(0, 0, 0, 0.25)',
        }}
      >
        <Paper elevation={8} sx={{ p: 2, width: '100%', maxWidth: 400 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <CircularProgress size={28} />
            <Box role="status" aria-live="assertive" sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2">
                {t('screenshotInProgress')}
              </Typography>
              <Typography
                variant="caption"
                component="div"
                sx={{ color: 'text.secondary' }}
              >
                {t('screenshotInProgressHint')}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 1 }}>
            <Button size="small" onClick={onCancel}>
              {t('cancelScreenshot')}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Portal>
  );
}
