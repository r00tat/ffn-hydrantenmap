'use client';
import { FunctionComponent, useEffect, useState } from 'react';

const GeschaeftsbuchWrapper: FunctionComponent = () => {
  const [LayersPage, setLayersPage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const pageComponent = (await import('./Geschaeftsbuch')).default;
        setLayersPage(() => pageComponent);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !LayersPage) {
    return null;
  }

  return LayersPage ? <LayersPage /> : null;
};

export default GeschaeftsbuchWrapper;
