'use client';

import { waitForPendingWrites } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { firestore } from '../components/firebase/firebase';
import { useSnackbar } from '../components/providers/SnackbarProvider';
import { getPendingWriteCount } from '../lib/pendingWrites';
import useOnline from './useOnline';

/**
 * Shows a confirmation once changes that were made while offline have been
 * synced to the backend.
 *
 * On an offline → online transition, if there are still pending Firestore
 * writes, it waits for them to be acknowledged by the backend
 * (`waitForPendingWrites`) and then shows a success message. If nothing was
 * pending, no message is shown to avoid noise on every reconnect.
 */
export default function useOfflineSync(): void {
  const online = useOnline();
  const showSnackbar = useSnackbar();
  const t = useTranslations('networkStatus');
  const wasOnline = useRef(online);

  useEffect(() => {
    const previouslyOnline = wasOnline.current;
    wasOnline.current = online;

    // Only react to an offline -> online transition with queued writes.
    if (previouslyOnline || !online) {
      return;
    }
    if (getPendingWriteCount() === 0) {
      return;
    }

    let cancelled = false;
    waitForPendingWrites(firestore)
      .then(() => {
        if (!cancelled) {
          showSnackbar(t('synced'), 'success');
        }
      })
      .catch(() => {
        // Ignore — e.g. the user signed out before the sync completed.
      });

    return () => {
      cancelled = true;
    };
  }, [online, showSnackbar, t]);
}
