'use client';

import { useEffect } from 'react';
import { recordError } from '../components/firebase/crashlytics';

export default function useGlobalErrorReporter(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previousOnError = window.onerror;

    const onError: OnErrorEventHandler = (
      message,
      source,
      lineno,
      colno,
      error,
    ) => {
      try {
        const target = error ?? message;
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
      void recordError(reason ?? 'unhandledrejection', {
        source: 'unhandledrejection',
      });
    };

    window.addEventListener(
      'unhandledrejection',
      onUnhandledRejection as EventListener,
    );

    return () => {
      if (window.onerror === onError) {
        window.onerror = previousOnError ?? null;
      }
      window.removeEventListener(
        'unhandledrejection',
        onUnhandledRejection as EventListener,
      );
    };
  }, []);
}
