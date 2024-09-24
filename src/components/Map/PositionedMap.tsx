'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Position from './Position';

export default function PositionedMap() {
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      setHasLoaded(true);
    })();
  }, []);

  if (!hasLoaded) {
    return <div>Loading...</div>;
  }

  const Map = dynamic(() => import('./Map'));

  return (
    <Position>
      <Map />
    </Position>
  );
}
