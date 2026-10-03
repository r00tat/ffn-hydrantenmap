'use client';

import { useEffect, useState } from 'react';
import {
  buildAppShellUrls,
  requestAppShellWarmup,
} from '../lib/appShellWarmup';
import useConnectivity from './useConnectivity';
import { useFirecall } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Wartezeit nach dem Start, bevor vorgewärmt wird: Die Seite soll erst selbst
 * laden, bevor der Service Worker ein Dutzend Seiten abruft.
 */
export const APP_SHELL_WARMUP_DELAY_MS = 10_000;

/** Bereits vorgewärmte Einsätze dieses Seitenlebens ('' = ohne Einsatz). */
const warmed = new Set<string>();

export function resetAppShellWarmupForTests(): void {
  warmed.clear();
}

/**
 * Hält die App-Shell für den Kaltstart ohne Netz aktuell
 * (`src/worker/appShell.ts`): nach der Anmeldung, online, je Einsatz einmal,
 * und nach dem Wechsel auf einen neuen Service Worker erneut — der räumt beim
 * Aktivieren die App-Shell des alten Builds weg.
 */
export default function useAppShellWarmup(): void {
  const { isAuthorized, hasFirebaseUser } = useFirebaseLogin();
  const { status } = useConnectivity();
  const firecall = useFirecall();
  const firecallId =
    firecall?.id && firecall.id !== 'unknown' ? firecall.id : undefined;
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const sw =
      typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw?.addEventListener) return;
    const onControllerChange = () => {
      warmed.clear();
      setGeneration((g) => g + 1);
    };
    sw.addEventListener('controllerchange', onControllerChange);
    return () => sw.removeEventListener('controllerchange', onControllerChange);
  }, []);

  useEffect(() => {
    if (!isAuthorized || !hasFirebaseUser || status === 'offline') return;
    const key = firecallId ?? '';
    if (warmed.has(key)) return;

    const timer = setTimeout(() => {
      if (warmed.has(key)) return;
      warmed.add(key);
      void requestAppShellWarmup(buildAppShellUrls(firecallId)).then(
        (result) => {
          if (!result) {
            // Kein Worker (Entwicklung, erster Aufruf vor der Übernahme):
            // beim nächsten Anlass erneut versuchen.
            warmed.delete(key);
            return;
          }
          if (result.failed.length > 0) {
            console.info(
              `app shell warmed: ${result.cached} pages, failed: ${result.failed.join(', ')}`
            );
          }
        }
      );
    }, APP_SHELL_WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAuthorized, hasFirebaseUser, status, firecallId, generation]);
}
