'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { addNativeNotificationTapListener } from '../../lib/nativeLocalNotifications';

/**
 * Ein Tipp auf eine geplante Benachrichtigung der Android-App führt zu der
 * Seite, die sie nennt — etwa zur Atemschutzüberwachung des Einsatzes.
 *
 * Liegt unterhalb der Anmeldung: Die Zielseiten setzen eine Sitzung voraus.
 * Im Browser und ohne natives Plugin hängt der Listener nichts ein.
 */
export default function NativeNotificationTaps() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let remove: (() => void) | undefined;
    void addNativeNotificationTapListener((url) => router.push(url)).then(
      (unsubscribe) => {
        if (active) remove = unsubscribe;
        else unsubscribe();
      },
    );
    return () => {
      active = false;
      remove?.();
    };
  }, [router]);

  return null;
}
