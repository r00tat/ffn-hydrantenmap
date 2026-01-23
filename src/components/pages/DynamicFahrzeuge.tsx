'use client';

import dynamic from 'next/dynamic';

const Fahrzeuge = dynamic(() => import('./Fahrzeuge'), {
  ssr: false,
  loading: () => <>Loading...</>,
});

export default function DynamicFahrzeuge() {
  return <Fahrzeuge />;
}
