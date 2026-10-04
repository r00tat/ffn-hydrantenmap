'use client';

import { useParams, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { parseFirecallSectionPath } from '../../../common/firecallNavigation';
import { useFirecallSelect } from '../../../hooks/useFirecall';

export default function EinsatzClient({
  children,
}: {
  children: React.ReactNode;
}) {
  // Die Adresse zuerst: Nach einem Wechsel per pushState (FirecallLink) bleibt
  // useParams auf dem Einsatz, mit dem die Seite geladen wurde. Seiten mit
  // eigener Route (Kostenersatz, Schadstoff) erkennt der Parser nicht.
  const params = useParams<{ firecallId: string }>();
  const firecallId =
    parseFirecallSectionPath(usePathname())?.firecallId ?? params.firecallId;
  const setFirecallId = useFirecallSelect();

  useEffect(() => {
    if (firecallId && setFirecallId) {
      console.info(`changing firecall with navigation to ${firecallId}`);
      setFirecallId('' + firecallId);
    }
  }, [firecallId, setFirecallId]);

  return <>{children}</>;
}
