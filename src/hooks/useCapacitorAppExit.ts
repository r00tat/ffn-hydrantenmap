'use client';

import { Capacitor } from '@capacitor/core';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { nativeDisconnect } from './radiacode/nativeBridge';
import { nativeStopTrack } from './radiacode/nativeTrackBridge';
import { RadiacodeNotification } from './radiacode/radiacodeNotification';
import { nativeStopGpsTrack } from './recording/nativeGpsTrackBridge';

/**
 * Hook to handle the Android back button.
 * If we are at the root path ('/'), it stops all foreground services
 * and exits the app.
 */
export function useCapacitorAppExit() {
  const pathname = usePathname();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // We use dynamic import for @capacitor/app to avoid SSR issues
    const initListener = async () => {
      const { App } = await import('@capacitor/app');

      const listener = App.addListener('backButton', async (event) => {
        console.log(
          '[useCapacitorAppExit] backButton event',
          event,
          'pathname=',
          pathname,
        );

        // The user explicitly requested to exit the app instead of navigating back in history,
        // as history navigation (e.g. via swipe) was found to be unhelpful.
        const shouldExit = true;

        if (shouldExit) {
          console.log('[useCapacitorAppExit] Exiting app and stopping services');

          try {
            // 1. Stop all recorders and disconnect BLE
            await Promise.allSettled([
              nativeStopGpsTrack(),
              nativeStopTrack(),
              nativeDisconnect(),
            ]);

            // 2. Stop foreground service (removes notification and stops service)
            await RadiacodeNotification.stop().catch(() => {});
          } catch (err) {
            console.warn(
              '[useCapacitorAppExit] Failed to stop some native services',
              err,
            );
          }

          // 3. Finally exit the app
          await App.exitApp();
        } else {
          // If we are not at root and can go back, we must trigger it manually
          // because Capacitor suppresses the default behavior when a listener is added.
          window.history.back();
        }
      });

      return listener;
    };

    const listenerPromise = initListener();

    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, [pathname]);
}
