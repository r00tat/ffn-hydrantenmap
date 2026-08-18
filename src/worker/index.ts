import { defaultCache } from '@serwist/turbopack/worker';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  MessagePayload,
  getMessaging,
  onBackgroundMessage,
} from 'firebase/messaging/sw';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { disableNavigationPreload, Serwist } from 'serwist';
import { ChatMessage } from '../common/chat';
import { parseFirebaseConfig } from './firebaseConfig';
import { cachePatterns } from './patterns';

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [...cachePatterns, ...defaultCache],
});

serwist.addEventListeners();

// Navigation Preload bleibt aus, und zwar nicht bloß unkonfiguriert, sondern
// aktiv abgeschaltet.
//
// Mit `navigationPreload: true` schickt Chrome zu jeder Navigation zusätzlich
// einen eigenen Preload-Request (Header `Service-Worker-Navigation-Preload`),
// den der Service Worker nicht abfangen kann. Startet die installierte PWA über
// einen ACTION_VIEW-Intent — etwa aus einem gescannten QR-Code —, dann laufen
// mehrere Navigationen auf dieselbe URL: erst der Chrome-Tab, dann die
// Übergabe an die PWA, dann deren Wiederholung. Jede davon erzeugt einen
// Preload auf dieselbe Adresse, und ein HTTP-Cache-Eintrag lässt genau einen
// Schreiber zu. Die Preloads blockieren sich damit gegenseitig, je 20 Sekunden
// bis `ERR_CACHE_LOCK_TIMEOUT` (net_error -409). Gemessen an einem
// chrome://net-export des Geräts: drei Preloads auf `/`, 20,0 s + 20,0 s +
// 20,1 s, danach umgeht der letzte den Cache und die Antwort ist in 130 ms da.
// Bis dahin steht der WebAPK-Splash — die Minute, die zu #663 gemeldet wurde.
// `Cache-Control: no-store` auf dem HTML hilft nicht: die Sperre wird beim
// Anfragestart genommen, bevor die Antwort-Header bekannt sind.
//
// Serwist konsumiert `event.preloadResponse` erst, wenn seine Strategie
// `fetch()` aufruft. Das kommt zu spät — die Preloads verklemmen sich
// untereinander, bevor der Worker überhaupt läuft.
//
// Der Aufruf ist Pflicht, nicht Kosmetik: `navigationPreload.enable()` hängt
// persistent an der Registration, und Serwist schaltet nur ein
// (`if (navigationPreload) enableNavigationPreload()`) — nie aus. Die Option
// bloß zu entfernen ließe jede bereits installierte PWA auf ewig im alten
// Zustand. Gleiches Muster wie `unregisterLegacyServiceWorker()`: bestehender
// Zustand auf den Geräten muss aktiv weggeräumt werden. Der Aufruf darf erst
// entfernt werden, wenn alle Installationen erneuert sind.
//
// Der Preis ist gering: Ohne Preload wartet die Navigation auf den Start des
// Workers, gemessen rund 80 ms (FCP 316 ms kalt gegen 236 ms warm).
disableNavigationPreload();

// To disable all workbox logging during development, you can set self.__WB_DISABLE_DEV_LOGS to true
// https://developers.google.com/web/tools/workbox/guides/configure-workbox#disable_logging
//
self.__WB_DISABLE_DEV_LOGS = true;

// Der Wert wird beim Bauen von esbuild eingesetzt (`serviceWorkerDefine` in
// src/server/serviceWorkerDefine.ts). Wer hier eine weitere `process.env`-
// Variable liest, muss sie dort eintragen — sonst stirbt das Skript beim
// Auswerten an `ReferenceError: process is not defined`. Ein Test in
// src/server/serviceWorkerDefine.test.ts prüft das.
const firebaseConfig = parseFirebaseConfig(
  process.env.NEXT_PUBLIC_FIREBASE_APIKEY
);

const scope = 'sw:' + self.registration.scope.replace(/^.*\//, '');

console.info(
  `[${scope}] starting background service worker with scope ${self.registration.scope}!`
);

// self.registration.showNotification('Einsatz Chat', {
//   body: 'hello world!',
//   icon: '/app-icon.png',
//   actions: [
//     {
//       action: 'chat',
//       title: 'Open Chat',
//     },
//   ],
// });

// console.info(`[${scope}] self.reg`, self.registration);

self.registration.addEventListener('updatefound', (ev) => {
  console.info(`[${scope}] update found! `, ev);
});

// self.registration.update();

addEventListener('message', (event) => {
  console.log(
    `[${scope}] Message from navigator received: ${JSON.stringify(event.data)}`
  );

  //   if (event.data === 'messaging loaded') {
  //     console.info(`[${scope}] showing hello world!`);
  //     self.registration.showNotification('Einsatz Chat', {
  //       body: 'Started!',
  //       icon: '/app-icon.png',
  //       actions: [
  //         {
  //           action: 'chat',
  //           title: 'Open Chat',
  //         },
  //       ],
  //     });
  //   }
});

addEventListener('notificationclick', (ev) => {
  const event = ev as NotificationEvent;
  console.log('On notification click: ', event.action);
  event.notification.close();

  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
      })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === '/chat' && 'focus' in client)
            return (client as any)?.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/chat');
      })
  );
});

interface NotificationOptionsWithActions extends NotificationOptions {
  actions?: { action: string; title: string }[];
}

function startBackgroundMessaging(config: FirebaseOptions) {
  console.info(`[${scope}] firebase messaging scope, starting messaging`);
  initializeApp(config);

  const messaging = getMessaging();

  // If you would like to customize notifications that are received in the
  // background (Web app is closed or not in browser focus) then you should
  // implement this optional method.
  // Keep in mind that FCM will still show notification messages automatically
  // and you should use data messages for custom notifications.
  // For more info see:
  // https://firebase.google.com/docs/cloud-messaging/concept-options
  onBackgroundMessage(messaging, function (payload: MessagePayload) {
    console.info(
      `[${scope}] Received fb background message ${JSON.stringify(payload)}`
    );
    // Customize notification here
    if (payload.data) {
      const message: ChatMessage = payload.data as unknown as ChatMessage;
      const notificationTitle = `Einsatz Chat: ${
        message.name || message.email
      }`;
      const notificationOptions: NotificationOptionsWithActions = {
        body: message.message,
        icon: '/app-icon.png',
        actions: [
          {
            action: 'chat',
            title: 'Open Chat',
          },
        ],
      };

      console.info(`[${scope}] showing notification`);
      self.registration.showNotification(
        notificationTitle,
        notificationOptions
      );
    }
  });
}

// Push ist die Kür, Precaching und Caching-Regeln sind die Pflicht: Wirft
// irgendetwas an dieser Einrichtung — eine unbrauchbare Konfiguration,
// `getMessaging()` in einem Browser ohne Push-Unterstützung — dann bricht das
// die Auswertung des Skripts ab und der Worker registriert sich überhaupt
// nicht mehr. Die App liefe dann mit dem Precache eines alten Builds weiter
// (siehe #663), nur damit eine Benachrichtigung ankommt.
if (firebaseConfig) {
  try {
    startBackgroundMessaging(firebaseConfig);
  } catch (err) {
    console.error(`[${scope}] failed to start background messaging`, err);
  }
} else {
  console.warn(
    `[${scope}] no usable firebase config - background messaging disabled`
  );
}
