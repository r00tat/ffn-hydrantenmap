'use client';

import dynamic from 'next/dynamic';

const Dosimetrie = dynamic(
  () => import('../../../components/pages/Dosimetrie'),
  { ssr: false, loading: () => null },
);

export default function DosimetriePage() {
  return <Dosimetrie />;
}
