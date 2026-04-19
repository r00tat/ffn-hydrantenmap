'use client';

import dynamic from 'next/dynamic';

const EnergySpectrum = dynamic(
  () => import('../../../../../components/pages/EnergySpectrum'),
  {
    ssr: false,
    loading: () => null,
  }
);

export default function EnergiespektrumPage() {
  return <EnergySpectrum />;
}
