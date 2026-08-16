import type { NextPage } from 'next';
import { Suspense } from 'react';
import FahrtenbuchPage from '../../components/Fahrtenbuch/FahrtenbuchPage';

/**
 * `FahrtenbuchPage` liest die Filter-Parameter der Fahrtenliste über
 * `useSearchParams`. Ohne Suspense-Grenze zwingt das die gesamte Route ins
 * Client-Side-Rendering und der Build meldet es als Fehler.
 */
const Fahrtenbuch: NextPage = () => {
  return (
    <Suspense>
      <FahrtenbuchPage />
    </Suspense>
  );
};

export default Fahrtenbuch;
