'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Modal from '@mui/material/Modal';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';

export interface ScreenshotCaptureOverlayProps {
  open: boolean;
  onCancel: () => void;
  /**
   * `dialog`: der Bug-Report ist kurz ausgeblendet (Knopf im Dialog).
   * `hotkey`: per Tastenkürzel ausgelöst, der Bug-Report öffnet sich danach.
   */
  variant?: 'dialog' | 'hotkey';
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
 *
 * A MUI `Modal` rather than a plain fixed box: when the capture is started by
 * hotkey, another app dialog is usually open underneath, and only the topmost
 * modal enforces focus (MUI's ModalManager). As a plain element the cancel
 * button would lose focus to that dialog's focus trap. No scroll lock — its
 * scrollbar padding would shift the page that is being captured.
 */
export default function ScreenshotCaptureOverlay({
  open,
  onCancel,
  variant = 'dialog',
}: ScreenshotCaptureOverlayProps) {
  const t = useTranslations('bugReport');

  if (!open) return null;

  return (
    <Modal
      open
      onClose={(_event, reason) => {
        if (reason === 'escapeKeyDown') onCancel();
      }}
      hideBackdrop
      disableScrollLock
      data-skip-screenshot="true"
      // Above the (hidden) dialog, any other dialog and any map overlay.
      sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
    >
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          outline: 'none',
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
              <Typography variant="subtitle2">{t('screenshotInProgress')}</Typography>
              <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                {variant === 'hotkey'
                  ? t('screenshotInProgressHintHotkey')
                  : t('screenshotInProgressHint')}
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
    </Modal>
  );
}
