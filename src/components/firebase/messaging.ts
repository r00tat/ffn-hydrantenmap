import { Capacitor } from '@capacitor/core';
import { Messaging, getMessaging, getToken } from 'firebase/messaging';
import {
  SERWIST_SW_URL,
  unregisterLegacyServiceWorker,
} from '../../common/serviceWorker';
import { ensureNotifications } from '../../lib/permissions';
import app from './firebase';

export async function requestPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return ensureNotifications();
  }
  if (typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  console.log('Requesting notification permission...');
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    console.log('Notification permission granted.');
    return true;
  }
  console.log(`Permission not granted: ${permission}`);
  return false;
}

export async function getMessagingToken(): Promise<string | undefined> {
  // Get registration token. Initially this makes a network call, once retrieved
  // subsequent calls to getToken will return from cache.
  const messaging: Messaging = getMessaging(app);

  const granted = await requestPermission();
  if (granted) {
    // Alten, per Webpack nach public/ geschriebenen Worker abmelden, bevor der
    // neue registriert wird — sonst bleiben bei bereits installierten PWAs zwei
    // Worker aktiv.
    await unregisterLegacyServiceWorker();

    // register() ist fuer dieselbe Skript-URL und denselben Scope idempotent und
    // liefert die bestehende Registrierung zurueck. Der SerwistProvider im
    // Root-Layout registriert denselben Worker, hier wird also nichts doppelt
    // angelegt. Root-Scope ist moeglich, weil der Route Handler
    // `Service-Worker-Allowed: /` setzt.
    const reg = await navigator.serviceWorker.register(SERWIST_SW_URL, {
      scope: '/',
    });

    // Ohne aktiven Worker lehnt das Firebase-SDK die Registrierung ab
    // (invalid-sw-registration), direkt nach register() ist sie das aber noch
    // nicht zwangslaeufig.
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey:
        'BBFxZ_tOn6iVR5Sua3oXDBPyw-FYZfHWZcPD2emQ8Zv-r7LuNyKVs1U11uiEj5FZLoXH3nff_CqPqlqKQFJvr8E',
      serviceWorkerRegistration: reg,
    });
    return token;
  }

  return undefined;
}
