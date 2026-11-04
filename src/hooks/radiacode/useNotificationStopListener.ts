'use client';

import { useEffect, useRef } from 'react';
import { RadiacodeNotification } from './radiacodeNotification';

/**
 * Abonniert das native `stopRequested`-Event des Foreground-Service und ruft
 * `onStop` auf, wenn der Nutzer „Tracking beenden" in der Notification antippt.
 *
 * Der GpsProvider beendet damit die GPS-/Radiacode-Aufzeichnung über seinen
 * bestehenden Stop-Pfad. Radiacode trennen und „App beenden" laufen über
 * eigene Wege (`disconnectRequested` bzw. nativ im Service).
 *
 * Der Handler wird in einem Ref gehalten, damit ein State-Wechsel im Owner
 * kein Re-Subscribe auslöst, aber beim Event-Eintritt immer die aktuelle
 * Stop-Funktion läuft.
 */
export function useNotificationStopListener(
  onStop: () => void | Promise<void>,
): void {
  const handlerRef = useRef(onStop);
  useEffect(() => {
    handlerRef.current = onStop;
  }, [onStop]);

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null;
    let removed = false;

    RadiacodeNotification.addListener('stopRequested', () => {
      void handlerRef.current();
    })
      .then((h) => {
        if (removed) {
          h.remove().catch(() => {});
          return;
        }
        handle = h;
      })
      .catch(() => {});

    return () => {
      removed = true;
      handle?.remove().catch(() => {});
    };
  }, []);
}
