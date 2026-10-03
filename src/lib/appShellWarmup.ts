'use client';

import {
  APP_SHELL_FIRECALL_PATHS,
  APP_SHELL_PAGES,
} from '../common/appShellRoutes';
import { APP_SHELL_WARM_REQUEST } from '../common/serviceWorker';

/**
 * Alle Seiten der App-Shell (`src/common/appShellRoutes.ts`), mit Einsatz auch
 * dessen Seiten. Die Einsatzseiten stehen vorne: Sie werden im Einsatz zuerst
 * gebraucht, und für einen offline angelegten Einsatz dienen sie als Vorlage.
 */
export function buildAppShellUrls(firecallId?: string): string[] {
  if (!firecallId || firecallId === 'unknown') return [...APP_SHELL_PAGES];
  const base = `/einsatz/${encodeURIComponent(firecallId)}`;
  return [
    ...APP_SHELL_FIRECALL_PATHS.map((path) => `${base}${path}`),
    ...APP_SHELL_PAGES,
  ];
}

export interface AppShellWarmResult {
  /** Neu abgelegt. */
  cached: number;
  /** Schon im Cache dieses Builds, nicht erneut abgerufen. */
  present: number;
  /** Netzfehler, Zeitüberschreitung oder 5xx — ein neuer Versuch lohnt. */
  failed: string[];
  /** Antwort ohne Seite (Umleitung, 4xx) — ein neuer Versuch ändert nichts. */
  rejected: string[];
}

/**
 * Bittet den Service Worker, die Seiten vorzuhalten. `null`, wenn es keinen
 * kontrollierenden Worker gibt (Entwicklung, erster Aufruf) oder er nicht
 * rechtzeitig antwortet. Die Zeitgrenze ist großzügig: Beim ersten Mal ruft
 * der Worker rund hundert Seiten ab.
 */
export function requestAppShellWarmup(
  urls: string[],
  timeoutMs = 10 * 60_000,
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
