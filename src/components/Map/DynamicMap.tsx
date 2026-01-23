'use client';

import dynamic from 'next/dynamic';

const PositionedMap = dynamic(() => import('./PositionedMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Karte wird geladen...
    </div>
  ),
});

export default function DynamicMap() {
  return <PositionedMap />;
}
