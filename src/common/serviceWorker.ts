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
