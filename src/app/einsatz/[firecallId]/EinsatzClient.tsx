'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useFirecallSelect } from '../../../hooks/useFirecall';

export default function EinsatzClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { firecallId } = useParams<{ firecallId: string }>();
  const setFirecallId = useFirecallSelect();

  useEffect(() => {
    if (firecallId && setFirecallId) {
      console.info(`changing firecall with navigation to ${firecallId}`);
      setFirecallId('' + firecallId);
    }
  }, [firecallId, setFirecallId]);

  return <>{children}</>;
}
