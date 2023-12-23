import { useRouter } from 'next/router';

import { useEffect } from 'react';
import { useFirecallSelect } from '../../hooks/useFirecall';

import dynamic from 'next/dynamic';

const DynamicMap = dynamic(
  () => {
    return import('../../components/Map/PositionedMap');
  },
  { ssr: false }
);

export default function EinsatzPage() {
  const router = useRouter();
  const setFirecallId = useFirecallSelect();

  useEffect(() => {
    if (router.query.firecallId && setFirecallId) {
      setFirecallId('' + router.query.firecallId);
    }
  }, [router.query.firecallId, setFirecallId]);

  return <DynamicMap />;
}
