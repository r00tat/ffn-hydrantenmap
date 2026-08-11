'use client';
import { useEffect } from 'react';
import { recordError } from '../components/firebase/crashlytics';

// Error boundaries must be Client Components
// see https://nextjs.org/docs/app/building-your-application/routing/error-handling#uncaught-exceptions

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next.js 16.3: siehe error.tsx — retry() holt auch Server-Daten neu.
  retry: () => void;
}) {
  useEffect(() => {
    void recordError(error, {
      source: 'next-global-error',
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error]);

  return (
    // global-error must include html and body tags
    <html lang="de">
      <body>
        <h2>Etwas ist schiefgelaufen</h2>
        <button onClick={() => retry()}>Erneut versuchen</button>
      </body>
    </html>
  );
}
