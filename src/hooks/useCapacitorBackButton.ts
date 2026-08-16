'use client';

import type { BackButtonListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { closeTopmostModal } from '../common/closeTopmostModal';
import { nativeDisconnect } from './radiacode/nativeBridge';
import { nativeStopTrack } from './radiacode/nativeTrackBridge';
import { RadiacodeNotification } from './radiacode/radiacodeNotification';
import { nativeStopGpsTrack } from './recording/nativeGpsTrackBridge';

/**
 * Zeitfenster, in dem der zweite Zurück-Druck die App tatsächlich beendet.
 */
export const EXIT_CONFIRM_TIMEOUT_MS = 2500;

/**
 * Beendet die App, nachdem alle nativen Dienste sauber gestoppt sind.
 *
 * Ohne diesen Schritt überleben Foreground-Service und BLE-Verbindung den
 * Prozess und hinterlassen eine Notification zu einer App, die es nicht mehr
 * gibt.
 */
async function stopNativeServicesAndExit() {
  const { App } = await import('@capacitor/app');

  try {
    // 1. Recorder stoppen und BLE trennen
    await Promise.allSettled([
      nativeStopGpsTrack(),
      nativeStopTrack(),
      nativeDisconnect(),
    ]);

    // 2. Foreground-Service beenden (entfernt die Notification)
    await RadiacodeNotification.stop().catch(() => {});
  } catch (err) {
    console.warn(
      '[useCapacitorBackButton] Failed to stop some native services',
      err,
    );
  }

  // 3. Erst jetzt die App beenden
  await App.exitApp();
}

/**
 * Behandelt die Hardware-/Gesten-Zurück-Taste unter Android.
 *
 * Capacitor unterdrückt das Standardverhalten des WebViews, sobald ein
 * `backButton`-Listener registriert ist — jede Ebene muss deshalb hier von
 * Hand abgebildet werden:
 *
 * 1. Ist ein Overlay offen (Dialog, Drawer, Menü), wird nur dieses geschlossen.
 * 2. Gibt es History, wird eine Seite zurück navigiert.
 * 3. Erst am Anfang der History wird die App beendet — und auch dann erst nach
 *    einem zweiten Druck innerhalb von {@link EXIT_CONFIRM_TIMEOUT_MS}. Ein
 *    versehentlicher Druck soll keinen laufenden Einsatz abbrechen.
 *
 * Vorher beendete jeder Druck die App sofort (Issue #664); das war als
 * Reaktion auf unbrauchbare Wisch-Navigation gedacht, hat aber auch die
 * gewollte Zurück-Navigation mitgenommen.
 */
export function useCapacitorBackButton() {
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const exitArmedRef = useRef(false);
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const disarmExitPrompt = useCallback(() => {
    exitArmedRef.current = false;
    clearTimeout(disarmTimerRef.current);
    disarmTimerRef.current = undefined;
    setExitPromptOpen(false);
  }, []);

  const handleBackButton = useCallback(
    async (event: BackButtonListenerEvent) => {
      if (closeTopmostModal()) {
        disarmExitPrompt();
        return;
      }

      if (event.canGoBack) {
        disarmExitPrompt();
        window.history.back();
        return;
      }

      if (exitArmedRef.current) {
        disarmExitPrompt();
        await stopNativeServicesAndExit();
        return;
      }

      exitArmedRef.current = true;
      setExitPromptOpen(true);
      disarmTimerRef.current = setTimeout(() => {
        exitArmedRef.current = false;
        setExitPromptOpen(false);
      }, EXIT_CONFIRM_TIMEOUT_MS);
    },
    [disarmExitPrompt],
  );

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Dynamischer Import, damit `@capacitor/app` beim SSR nicht geladen wird.
    const listenerPromise = import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', handleBackButton),
    );

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [handleBackButton]);

  useEffect(() => () => clearTimeout(disarmTimerRef.current), []);

  return { exitPromptOpen, dismissExitPrompt: disarmExitPrompt };
}
