'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useFirecallSelect } from '../../../hooks/useFirecall';

export default function EinsatzClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const firecallId = searchParams?.get('firecallId');
  const setFirecallId = useFirecallSelect();

  useEffect(() => {
    if (firecallId && setFirecallId) {
      setFirecallId('' + firecallId);
    }
  }, [firecallId, setFirecallId]);

  return <>{children}</>;
}
