import { Suspense } from 'react';
import MangelPage from '../../../components/Fahrtenbuch/MangelPage';

/**
 * `MangelPage` liest den Query-Parameter `?vehicle=` über `useSearchParams`.
 * Ohne Suspense-Grenze zwingt das die gesamte Route ins Client-Side-Rendering
 * und der Build meldet es als Fehler.
 */
export default function Page() {
  return (
    <Suspense>
      <MangelPage />
    </Suspense>
  );
}
