'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';
import { speakMessage } from '../../common/speech';

export interface AiToastState {
  open: boolean;
  message: string;
  severity: 'success' | 'warning' | 'error';
  showUndo?: boolean;
  clarificationOptions?: string[];
  /** Anzahl der Leitungsvorschläge, die auf Bestätigung warten */
  draftCount?: number;
}

export interface AiActionToastProps {
  state: AiToastState;
  onClose: () => void;
  onUndo?: () => void;
  onClarificationSelect?: (option: string) => void;
  onDraftConfirm?: () => void;
  onDraftDiscard?: () => void;
}

export default function AiActionToast({
  state,
  onClose,
  onUndo,
  onClarificationSelect,
  onDraftConfirm,
  onDraftDiscard,
}: AiActionToastProps) {
  const t = useTranslations('ai');
  const {
    open,
    message,
    severity,
    showUndo,
    clarificationOptions,
    draftCount = 0,
  } = state;
  const showDraftConfirm = draftCount > 0;

  // Speak error and warning messages
  useEffect(() => {
    if (open && (severity === 'error' || severity === 'warning')) {
      speakMessage(message);
    }
  }, [open, message, severity]);

  const handleClose = useCallback(
    (_event?: React.SyntheticEvent | Event, reason?: string) => {
      if (reason === 'clickaway') return;
      onClose();
    },
    [onClose]
  );

  const handleUndo = useCallback(() => {
    onUndo?.();
    onClose();
  }, [onClose, onUndo]);

  const handleOptionClick = useCallback(
    (option: string) => {
      onClarificationSelect?.(option);
      onClose();
    },
    [onClarificationSelect, onClose]
  );

  const handleDraftConfirm = useCallback(() => {
    onDraftConfirm?.();
    onClose();
  }, [onClose, onDraftConfirm]);

  const handleDraftDiscard = useCallback(() => {
    onDraftDiscard?.();
    onClose();
  }, [onClose, onDraftDiscard]);

  // Ein Vorschlag darf nicht wegblinken, bevor er beantwortet ist — sonst
  // bliebe der Entwurf auf der Karte liegen, ohne Weg ihn loszuwerden.
  const autoHideDuration =
    clarificationOptions || showDraftConfirm ? null : 5000;

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={handleClose}
        severity={severity}
        variant="filled"
        sx={{ width: '100%' }}
        action={
          showUndo && !clarificationOptions && !showDraftConfirm ? (
            <Button color="inherit" size="small" onClick={handleUndo}>
              {t('undo')}
            </Button>
          ) : undefined
        }
      >
        {message}
        {showDraftConfirm && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="contained"
              color="inherit"
              onClick={handleDraftConfirm}
            >
              {draftCount > 1 ? t('draftConfirmAll', { count: draftCount }) : t('draftConfirm')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={handleDraftDiscard}
            >
              {draftCount > 1 ? t('draftDiscardAll') : t('draftDiscard')}
            </Button>
          </Stack>
        )}
        {clarificationOptions && clarificationOptions.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {clarificationOptions.map((option) => (
              <Button
                key={option}
                size="small"
                variant="outlined"
                color="inherit"
                onClick={() => handleOptionClick(option)}
              >
                {option}
              </Button>
            ))}
          </Stack>
        )}
      </Alert>
    </Snackbar>
  );
}
