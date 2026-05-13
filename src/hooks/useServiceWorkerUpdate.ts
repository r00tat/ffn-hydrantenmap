'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useSnackbar } from '../components/providers/SnackbarProvider';

export default function useServiceWorkerUpdate() {
  const showSnackbar = useSnackbar();
  const t = useTranslations('versionUpdate');

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleControllerChange = () => {
      showSnackbar(
        t('available'),
        'info',
        {
          label: t('reload'),
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
  }, [showSnackbar, t]);
}
