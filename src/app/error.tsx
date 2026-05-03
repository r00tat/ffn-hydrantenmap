'use client'; // Error boundaries must be Client Components

// see https://nextjs.org/docs/app/building-your-application/routing/error-handling#uncaught-exceptions

import { useEffect } from 'react';
import { recordError } from '../components/firebase/crashlytics';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
      <button onClick={() => reset()}>Erneut versuchen</button>
    </div>
  );
}
