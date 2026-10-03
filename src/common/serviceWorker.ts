/**
 * URL, unter der `@serwist/turbopack` den Service Worker ausliefert. Der Route
 * Handler liegt in `src/app/serwist/[path]/route.ts` und setzt
 * `Service-Worker-Allowed: /`, damit die Registrierung trotz des Unterpfads den
 * Root-Scope beanspruchen darf.
 */
export const SERWIST_SW_URL = '/serwist/sw.js';

/**
 * URL des Service Workers vor dem Wechsel auf Turbopack. Damals hat das
 * Serwist-Webpack-Plugin die Datei nach `public/firebase-messaging-sw.js`
 * geschrieben; sie wird nicht mehr ausgeliefert.
 *
 * Bereits installierte PWAs haben darauf aber noch eine aktive Registrierung.
 * Ein Service Worker bleibt auch dann aktiv, wenn sein Skript nicht mehr
 * erreichbar ist, und wuerde weiterhin seinen alten Precache ausliefern —
 * deshalb wird die Registrierung beim Start aktiv abgemeldet.
 */
export const LEGACY_SW_URL = '/firebase-messaging-sw.js';

/**
 * Meldet die Service-Worker-Registrierung der alten `firebase-messaging-sw.js`
 * ab und gibt die Anzahl der abgemeldeten Registrierungen zurueck.
 */
export async function unregisterLegacyServiceWorker(
  container: ServiceWorkerContainer | undefined = typeof navigator !==
  'undefined'
    ? navigator.serviceWorker
    : undefined,
): Promise<number> {
  if (!container) {
    return 0;
  }

  const registrations = await container.getRegistrations();
  const legacy = registrations.filter((registration) =>
    [
      registration.active,
      registration.waiting,
      registration.installing,
    ].some((worker) => worker?.scriptURL.endsWith(LEGACY_SW_URL)),
  );

  const results = await Promise.all(
    legacy.map(async (registration) => {
      try {
        return await registration.unregister();
      } catch (err) {
        // Nicht blockierend: schlaegt das Abmelden fehl, laeuft die App mit dem
        // alten Worker weiter, statt den Start zu verhindern.
        console.warn('failed to unregister legacy service worker', err);
        return false;
      }
    }),
  );

  return results.filter(Boolean).length;
}

/**
 * Nachricht, mit der die Seite den Service Worker nach seiner Build-ID fragt.
 * Die Antwort `{ buildId }` kommt über den mitgeschickten `MessagePort`.
 */
export const SW_BUILD_ID_REQUEST = 'sw-build-id';

/**
 * Nachricht, mit der die Seite den Service Worker bittet, Seiten in die
 * App-Shell zu laden (Kaltstart ohne Netz, `src/worker/appShell.ts`).
 * `{ type, urls }`; die Antwort `{ cached, failed }` kommt über den
 * mitgeschickten `MessagePort`.
 */
export const APP_SHELL_WARM_REQUEST = 'app-shell-warm';

/**
 * Fragt `worker` nach der Build-ID, aus der er gebaut wurde. Antwortet er nicht
 * innerhalb von `timeoutMs` — etwa ein Worker aus einem Build vor dieser
 * Nachricht —, ist das Ergebnis `undefined`.
 */
export function requestWorkerBuildId(
  worker: ServiceWorker | null | undefined,
  timeoutMs = 3000,
): Promise<string | undefined> {
  if (!worker || typeof MessageChannel === 'undefined') {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(undefined);
    }, timeoutMs);

    channel.port1.onmessage = (event: MessageEvent<{ buildId?: unknown }>) => {
      clearTimeout(timer);
      channel.port1.close();
      const buildId = event.data?.buildId;
      resolve(typeof buildId === 'string' ? buildId : undefined);
    };

    try {
      worker.postMessage({ type: SW_BUILD_ID_REQUEST }, [channel.port2]);
    } catch (err) {
      console.warn('failed to ask the service worker for its build id', err);
      clearTimeout(timer);
      channel.port1.close();
      resolve(undefined);
    }
  });
}

/**
 * Ob ein Service Worker mit `workerBuildId` neuer ist als die laufende Seite.
 *
 * Ist eine der beiden IDs unbekannt (lokaler Build, alter Worker ohne Antwort),
 * gilt der Worker als neu: lieber einmal zu oft melden als ein echtes Update
 * verschweigen.
 */
export function isNewWorkerBuild(
  pageBuildId: string | undefined,
  workerBuildId: string | undefined,
): boolean {
  if (!pageBuildId || !workerBuildId) {
    return true;
  }
  return pageBuildId !== workerBuildId;
}
