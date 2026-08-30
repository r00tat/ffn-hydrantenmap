'use client';

import { useParams } from 'next/navigation';
import RechnungPage from '../../../../components/Atemschutz/RechnungPage';

export default function Page() {
  const params = useParams<{ rechnungId: string }>();
  return <RechnungPage rechnungId={params.rechnungId} />;
}
