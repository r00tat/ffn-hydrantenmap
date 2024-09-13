'use client';
import { FunctionComponent, useEffect, useState } from 'react';

const EinsatzTagebuchWrapper: FunctionComponent = () => {
  const [LayersPage, setLayersPage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const pageComponent = (await import('./EinsatzTagebuch')).default;
        setLayersPage(() => pageComponent);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !LayersPage) {
    return null;
  }

  return LayersPage ? <LayersPage /> : null;
};

export default EinsatzTagebuchWrapper;
