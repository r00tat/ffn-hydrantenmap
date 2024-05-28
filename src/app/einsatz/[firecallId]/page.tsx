'use client';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useFirecallSelect } from '../../../hooks/useFirecall';

const Map = dynamic(() => import('../../../components/Map/PositionedMap'), {
  ssr: false,
});

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
