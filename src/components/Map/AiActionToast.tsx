'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import { useCallback, useEffect } from 'react';
import { speakMessage } from '../../common/speech';

export interface AiToastState {
  open: boolean;
  message: string;
  severity: 'success' | 'warning' | 'error';
  showUndo?: boolean;
  clarificationOptions?: string[];
}

export interface AiActionToastProps {
  state: AiToastState;
  onClose: () => void;
  onUndo?: () => void;
  onClarificationSelect?: (option: string) => void;
}

export default function AiActionToast({
  state,
  onClose,
  onUndo,
  onClarificationSelect,
}: AiActionToastProps) {
  const { open, message, severity, showUndo, clarificationOptions } = state;

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

  const autoHideDuration = clarificationOptions ? null : 5000;

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
          showUndo && !clarificationOptions ? (
            <Button color="inherit" size="small" onClick={handleUndo}>
              Rückgängig
            </Button>
          ) : undefined
        }
      >
        {message}
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
