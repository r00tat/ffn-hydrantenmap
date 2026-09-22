'use client';

import { useEffect } from 'react';
import { recordError } from '../components/firebase/crashlytics';
import { auth } from '../components/firebase/firebase';

/**
 * Ein `permission-denied` ohne angemeldeten Firebase-Benutzer ist kein Fehler,
 * sondern die Regel, die greift: `request.auth` ist null, und Firestore lehnt
 * ab. Auf dem Login-Bildschirm ist das der Normalfall — als Absturz gezaehlt
 * verstopft es die Crashlytics-Auswertung und verdeckt die echten.
 *
 * Mit angemeldetem Benutzer bleibt es eine Meldung wert: dann fehlt wirklich
 * ein Recht, und das will man sehen. Die Abfrage haengt deshalb am
 * Auth-Zustand, nicht am Fehlercode allein.
 *
 * Das ist die letzte Instanz, nicht die erste. Ein Listener, der ohne Benutzer
 * gar nicht erst startet, ist besser — Vorbild `useFirebaseCollection`.
 */
function isSignedOutPermissionDenial(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  if ((reason as { code?: unknown }).code !== 'permission-denied') return false;
  try {
    return !auth.currentUser;
  } catch {
    return false;
  }
}

export default function useGlobalErrorReporter(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previousOnError = window.onerror;

    const onError: OnErrorEventHandler = (message, source, lineno, colno, error) => {
      try {
        const target = error ?? message;
        if (isSignedOutPermissionDenial(target)) {
          console.info('ignoring permission-denied while signed out');
          return false;
        }
        void recordError(target, {
          source: 'window.onerror',
          ...(typeof source === 'string' ? { fileName: source } : {}),
          ...(typeof lineno === 'number' ? { lineNumber: lineno } : {}),
          ...(typeof colno === 'number' ? { columnNumber: colno } : {}),
        });
      } catch {
        // best-effort
      }

      if (typeof previousOnError === 'function') {
        return previousOnError(message, source, lineno, colno, error);
      }
      return false;
    };

    window.onerror = onError;

    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      const reason: unknown = (event as Event & { reason?: unknown }).reason;
      if (isSignedOutPermissionDenial(reason)) {
        console.info('ignoring permission-denied while signed out');
        return;
      }
      void recordError(reason ?? 'unhandledrejection', {
        source: 'unhandledrejection',
      });
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection as EventListener);

    return () => {
      if (window.onerror === onError) {
        window.onerror = previousOnError ?? null;
      }
      window.removeEventListener('unhandledrejection', onUnhandledRejection as EventListener);
    };
  }, []);
}
