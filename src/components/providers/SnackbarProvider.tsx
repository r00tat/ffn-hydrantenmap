'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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
  autoHide: boolean;
}

type ShowSnackbar = (
  message: string,
  severity: Severity,
  action?: SnackbarAction,
) => void;

const SnackbarContext = createContext<ShowSnackbar>(() => {});

export function useSnackbar(): ShowSnackbar {
  return useContext(SnackbarContext);
}

const initialState: SnackbarState = {
  open: false,
  message: '',
  severity: 'info',
  autoHide: true,
};

export default function SnackbarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SnackbarState>(initialState);

  const showSnackbar: ShowSnackbar = useCallback(
    (message, severity, action) => {
      setState({
        open: true,
        message,
        severity,
        action,
        autoHide: severity === 'success' || severity === 'info',
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
        autoHideDuration={state.autoHide ? 5000 : null}
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
              <Button
                color="inherit"
                size="small"
                onClick={state.action.onClick}
              >
                {state.action.label}
              </Button>
            ) : undefined
          }
        >
          {state.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
