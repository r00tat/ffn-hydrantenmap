'use client';

import { useEffect, useRef } from 'react';
import { useSnackbar } from '../components/providers/SnackbarProvider';

/**
 * Detects "Failed to find Server Action" errors that occur when
 * a new deployment is live but the client still runs old code.
 * Shows a snackbar prompting the user to reload.
 */
export default function useServerActionErrorDetection() {
  const showSnackbar = useSnackbar();
  const shownRef = useRef(false);

  useEffect(() => {
    const notify = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      showSnackbar(
        'Eine neue Version ist verfügbar. Bitte Seite neu laden.',
        'warning',
        {
          label: 'Neu laden',
          onClick: () => window.location.reload(),
        },
      );
    };

    const isServerActionError = (message: string) =>
      message.includes('Failed to find Server Action');

    const handleError = (event: ErrorEvent) => {
      if (isServerActionError(event.message || '')) {
        event.preventDefault();
        notify();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? '');
      if (isServerActionError(message)) {
        event.preventDefault();
        notify();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [showSnackbar]);
}
