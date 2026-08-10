'use client'; // Error boundaries must be Client Components

// see https://nextjs.org/docs/app/building-your-application/routing/error-handling#uncaught-exceptions

import { useEffect } from 'react';
import { recordError } from '../components/firebase/crashlytics';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next.js 16.3: `retry()` rendert auch fehlgeschlagene Server Components neu
  // und holt deren Daten erneut. `reset()` existiert weiterhin, setzt aber nur
  // den Client-State zurueck.
  retry: () => void;
}) {
  useEffect(() => {
    void recordError(error, {
      source: 'next-error-page',
      ...(error.digest ? { digest: error.digest } : {}),
    });
  }, [error]);

  return (
    <div>
      <h2>Etwas ist schiefgelaufen</h2>
      <button onClick={() => retry()}>Erneut versuchen</button>
    </div>
  );
}
