'use client';

import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

type Severity = 'success' | 'error' | 'warning' | 'info';

interface SnackbarAction {
  label: string;
  onClick: () => void;
}

interface SnackbarState {
  open: boolean;
  message: string;
  severity: Severity;
  action?: SnackbarAction;
  /** Anzeigedauer in ms; `null` heißt: bleibt stehen, bis jemand schließt. */
  autoHideMs: number | null;
}

type ShowSnackbar = (
  message: string,
  severity: Severity,
  action?: SnackbarAction,
  /**
   * Anzeigedauer in ms. Ohne Angabe gilt die Vorgabe: Erfolg und Hinweis gehen
   * nach `AUTO_HIDE_MS` von selbst, Warnung und Fehler bleiben stehen. Wer eine
   * Dauer mitgibt, bekommt sie **auch** für Warnung und Fehler — die
   * Atemschutzüberwachung will ihre Meldung wieder loswerden, weil sie am
   * Telefon sonst die Karte darunter verdeckt.
   */
  autoHideMs?: number,
) => void;

const SnackbarContext = createContext<ShowSnackbar>(() => {});

export function useSnackbar(): ShowSnackbar {
  return useContext(SnackbarContext);
}

/** Vorgabe für die Meldungen, die von selbst gehen dürfen. */
const AUTO_HIDE_MS = 5000;

const initialState: SnackbarState = {
  open: false,
  message: '',
  severity: 'info',
  autoHideMs: AUTO_HIDE_MS,
};

export default function SnackbarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SnackbarState>(initialState);

  const showSnackbar: ShowSnackbar = useCallback(
    (message, severity, action, autoHideMs) => {
      setState({
        open: true,
        message,
        severity,
        action,
        autoHideMs:
          autoHideMs ??
          (severity === 'success' || severity === 'info' ? AUTO_HIDE_MS : null),
      });
    },
    [],
  );

  const handleClose = useCallback(
    (_event?: React.SyntheticEvent | Event, reason?: string) => {
      if (reason === 'clickaway') return;
      setState((prev) => ({ ...prev, open: false }));
    },
    [],
  );

  return (
    <SnackbarContext.Provider value={showSnackbar}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={state.autoHideMs}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleClose}
          severity={state.severity}
          variant="filled"
          sx={{ width: '100%' }}
          action={
            state.action ? (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Button
                  color="inherit"
                  size="small"
                  onClick={state.action.onClick}
                >
                  {state.action.label}
                </Button>
                <IconButton
                  aria-label="Close"
                  color="inherit"
                  size="small"
                  onClick={handleClose}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : undefined
          }
        >
          {state.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
