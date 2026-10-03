'use client';

import { APP_SHELL_WARM_REQUEST } from '../common/serviceWorker';

/**
 * Seiten, die der Service Worker für den Kaltstart ohne Netz vorhält
 * (`src/worker/appShell.ts`). Die Inhalte kommen aus Firestore; vorgehalten
 * wird nur das HTML, das die App startet.
 *
 * `/offline` ist die Rückfallseite für alles, was nicht vorgehalten ist.
 */
export const APP_SHELL_PAGES: string[] = [
  '/',
  '/map',
  '/einsaetze',
  '/tagebuch',
  '/atemschutz',
  '/atemschutzueberwachung',
  '/einsatzmittel',
  '/einsatzorte',
  '/geschaeftsbuch',
  '/ebenen',
  '/offline',
];

/**
 * Abschnitte unter `/einsatz/<id>/…` (siehe
 * `src/app/einsatz/[firecallId]/[section]/page.tsx`), die im Einsatz offline
 * gebraucht werden. Die Seiten eines offline angelegten Einsatzes baut der
 * Worker aus denen des zuletzt vorgewärmten (`findTemplateFallback`).
 */
export const APP_SHELL_FIRECALL_SECTIONS = [
  'tagebuch',
  'atemschutz',
  'atemschutzueberwachung',
  'einsatzmittel',
  'einsatzorte',
  'geschaeftsbuch',
  'ebenen',
  'details',
  'loeschwasserversorgung',
  'hochwasser',
  'dammbau',
] as const;

export function buildAppShellUrls(firecallId?: string): string[] {
  if (!firecallId || firecallId === 'unknown') return [...APP_SHELL_PAGES];
  const base = `/einsatz/${encodeURIComponent(firecallId)}`;
  return [
    ...APP_SHELL_PAGES,
    base,
    ...APP_SHELL_FIRECALL_SECTIONS.map((section) => `${base}/${section}`),
  ];
}

export interface AppShellWarmResult {
  cached: number;
  failed: string[];
}

/**
 * Bittet den Service Worker, die Seiten vorzuhalten. `null`, wenn es keinen
 * kontrollierenden Worker gibt (Entwicklung, erster Aufruf) oder er nicht
 * rechtzeitig antwortet.
 */
export function requestAppShellWarmup(
  urls: string[],
  timeoutMs = 120_000,
): Promise<AppShellWarmResult | null> {
  const controller =
    typeof navigator !== 'undefined'
      ? navigator.serviceWorker?.controller
      : undefined;
  if (!controller || typeof MessageChannel === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<AppShellWarmResult>) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data ?? null);
    };
    try {
      controller.postMessage({ type: APP_SHELL_WARM_REQUEST, urls }, [
        channel.port2,
      ]);
    } catch (err) {
      console.warn('could not ask the service worker to warm the app shell', err);
      clearTimeout(timer);
      channel.port1.close();
      resolve(null);
    }
  });
}
