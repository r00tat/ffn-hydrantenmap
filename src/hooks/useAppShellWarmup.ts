'use client';

import { useEffect, useRef, useState } from 'react';
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
/**
 * Pause vor dem ersten neuen Versuch, wenn Seiten gescheitert sind; jeder
 * weitere wartet doppelt so lange.
 */
export const APP_SHELL_WARMUP_RETRY_MS = 30_000;
export const APP_SHELL_WARMUP_MAX_RETRIES = 5;

/**
 * Einsätze dieses Seitenlebens, deren Seiten vollständig vorgehalten sind
 * oder gerade abgerufen werden ('' = ohne Einsatz).
 */
const warmed = new Set<string>();
/** Gescheiterte Läufe je Einsatz, für die Pause vor dem nächsten. */
const attempts = new Map<string, number>();

export function resetAppShellWarmupForTests(): void {
  warmed.clear();
  attempts.clear();
}

/**
 * Hält die App-Shell für den Betrieb ohne Netz vollständig
 * (`src/worker/appShell.ts`): nach der Anmeldung, online, je Einsatz, und nach
 * dem Wechsel auf einen neuen Service Worker erneut — der räumt beim
 * Aktivieren die App-Shell des alten Builds weg.
 *
 * Das läuft im Hintergrund: Der Worker ruft die Seiten erst nach
 * `APP_SHELL_WARMUP_DELAY_MS` ab, damit der erste Seitenaufbau die Leitung für
 * sich hat, und überspringt, was er schon hält. Scheitern Seiten (Netz weg,
 * Zeitgrenze, 5xx), folgt ein neuer Versuch nach einer Pause und nach jedem
 * Reconnect — sonst fehlte eine einzelne Seite bis zum nächsten Neuladen.
 */
export default function useAppShellWarmup(): void {
  const { isAuthorized, hasFirebaseUser } = useFirebaseLogin();
  // Nur die Erreichbarkeit zählt: `status` wechselt mit jedem Schreibvorgang
  // zwischen `online` und `syncing` und startete die Wartezeit sonst neu.
  const { reachable } = useConnectivity();
  const firecall = useFirecall();
  const firecallId =
    firecall?.id && firecall.id !== 'unknown' ? firecall.id : undefined;
  const [generation, setGeneration] = useState(0);
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  useEffect(() => {
    const sw =
      typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw?.addEventListener) return;
    const onControllerChange = () => {
      warmed.clear();
      attempts.clear();
      setGeneration((g) => g + 1);
    };
    sw.addEventListener('controllerchange', onControllerChange);
    return () => sw.removeEventListener('controllerchange', onControllerChange);
  }, []);

  useEffect(() => {
    if (!isAuthorized || !hasFirebaseUser || !reachable) return;
    const key = firecallId ?? '';
    if (warmed.has(key)) return;

    const timer = setTimeout(() => {
      if (warmed.has(key)) return;
      warmed.add(key);
      void requestAppShellWarmup(buildAppShellUrls(firecallId)).then(
        (result) => {
          if (result && result.failed.length === 0) {
            attempts.delete(key);
            return;
          }
          // Kein Worker (Entwicklung, erster Aufruf vor der Übernahme) oder
          // gescheiterte Seiten: Beim Reconnect, beim Einsatzwechsel und nach
          // einer Pause erneut — der Worker holt dann nur, was fehlt.
          warmed.delete(key);
          if (result) {
            console.info(
              `app shell warmed: ${result.cached} new, ${result.present} present, failed: ${result.failed.join(', ')}`
            );
          }
          const attempt = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, attempt);
          if (attempt > APP_SHELL_WARMUP_MAX_RETRIES) return;
          if (retryTimer.current) clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(
            () => setRetry((r) => r + 1),
            APP_SHELL_WARMUP_RETRY_MS * 2 ** (attempt - 1)
          );
        }
      );
    }, APP_SHELL_WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAuthorized, hasFirebaseUser, reachable, firecallId, generation, retry]);
}
