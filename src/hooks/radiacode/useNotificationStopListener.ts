'use client';

import { useEffect, useRef } from 'react';
import { RadiacodeNotification } from './radiacodeNotification';

/**
 * Abonniert das native `stopRequested`-Event des Foreground-Service und ruft
 * `onStop` auf, wenn der Nutzer die „Beenden"-Action der Notification antippt.
 *
 * Jeder Owner eines Hintergrund-Modus (Radiacode-BLE, GPS-Track, Live-Share)
 * verwendet diesen Hook mit seiner eigenen Stop-Funktion. So beendet ein Tap
 * auf die Notification jeden aktuell aktiven Modus über dessen bestehenden
 * Teardown-Pfad — der Service beendet sich, sobald der letzte Modus weg ist.
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
