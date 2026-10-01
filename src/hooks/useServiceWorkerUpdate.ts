'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import {
  isNewWorkerBuild,
  requestWorkerBuildId,
} from '../common/serviceWorker';
import { useSnackbar } from '../components/providers/SnackbarProvider';

/**
 * Meldet „Neue Version verfügbar", sobald ein Service Worker aus einem anderen
 * Build die Seite übernimmt.
 *
 * `controllerchange` allein heißt noch keine neue Version:
 * - Hatte die Seite beim Laden keinen Controller (erster Aufruf, harter Reload,
 *   nach `sw-reset`), übernimmt sie der Worker per `clientsClaim()` — auch das
 *   ist ein `controllerchange`.
 * - Navigationen gehen über NetworkFirst. Kam die Seite schon frisch vom Netz
 *   und zieht der Worker erst danach nach (der Browser prüft beim Navigieren
 *   bzw. beim Fortsetzen der App), läuft die Seite bereits auf dem neuen Build.
 * Deshalb wird die Build-ID des neuen Workers mit der eigenen verglichen.
 */
export default function useServiceWorkerUpdate() {
  const showSnackbar = useSnackbar();
  const t = useTranslations('versionUpdate');

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let hadController = Boolean(navigator.serviceWorker.controller);
    let active = true;

    const handleControllerChange = async () => {
      if (!hadController) {
        hadController = true;
        return;
      }

      const workerBuildId = await requestWorkerBuildId(
        navigator.serviceWorker.controller,
      );
      if (
        !active ||
        !isNewWorkerBuild(process.env.NEXT_PUBLIC_BUILD_ID, workerBuildId)
      ) {
        return;
      }

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
      active = false;
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange,
      );
    };
  }, [showSnackbar, t]);
}
