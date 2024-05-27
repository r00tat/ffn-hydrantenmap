'use client';
import { useSearchParams } from 'next/navigation';

import { useEffect } from 'react';
import { useFirecallSelect } from '../../../hooks/useFirecall';
import Map from '../../../components/Map/PositionedMap';

export default function EinsatzPage() {
  const searchParams = useSearchParams();
  const firecallId = searchParams?.get('firecallId');
  const setFirecallId = useFirecallSelect();

  useEffect(() => {
    if (firecallId && setFirecallId) {
      setFirecallId('' + firecallId);
    }
  }, [firecallId, setFirecallId]);

  return <Map />;
}
