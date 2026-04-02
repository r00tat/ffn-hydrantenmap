'use client';

import { useEffect } from 'react';
import { useSnackbar } from '../components/providers/SnackbarProvider';

export default function useServiceWorkerUpdate() {
  const showSnackbar = useSnackbar();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleControllerChange = () => {
      showSnackbar(
        'Neue Version verfügbar',
        'info',
        {
          label: 'Neu laden',
          onClick: () => window.location.reload(),
        },
      );
    };

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange,
      );
    };
  }, [showSnackbar]);
}
