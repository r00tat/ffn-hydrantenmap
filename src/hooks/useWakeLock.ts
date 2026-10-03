'use client';

import { useEffect, useState } from 'react';

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
}

/**
 * Hält den Bildschirm eingeschaltet, solange `enabled` gilt (Screen Wake Lock
 * API).
 *
 * Für die Atemschutzüberwachung: Offline kommt kein Push, und eine Warnung aus
 * der Seite erreicht nur einen Bildschirm, der an ist. Der Browser gibt die
 * Sperre selbst frei, sobald die Seite verborgen wird (Tab-Wechsel, App im
 * Hintergrund, Bildschirm von Hand gesperrt) — deshalb wird sie bei jeder
 * Rückkehr (`visibilitychange`) neu angefordert.
 *
 * Gibt zurück, ob die Sperre gerade gehalten wird. Ohne API (ältere Browser,
 * Android-WebView) oder bei Ablehnung bleibt es bei `false` — die Seite
 * funktioniert dann wie bisher.
 */
export default function useWakeLock(enabled: boolean): boolean {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const api = wakeLockApi();
    if (!enabled || !api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;
    let pending = false;

    const acquire = async () => {
      if (disposed || pending) return;
      if (document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      try {
        const next = await api.request('screen');
        if (disposed) {
          await next.release();
          return;
        }
        sentinel = next;
        next.addEventListener('release', () => {
          if (sentinel === next) setLocked(false);
        });
        setLocked(true);
      } catch (err) {
        // NotAllowedError etwa bei Energiesparmodus — kein Fehler der Seite.
        console.warn('wake lock request failed', err);
        setLocked(false);
      } finally {
        pending = false;
      }
    };

    const onVisibility = () => {
      void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) {
        void current.release().catch(() => {});
      }
      // Die Freigabe-Meldung des Sentinels geht nach `sentinel = null` nicht
      // mehr durch; deshalb hier zurücksetzen (asynchron, nicht im Effekt).
      queueMicrotask(() => setLocked(false));
    };
  }, [enabled]);

  return locked;
}
