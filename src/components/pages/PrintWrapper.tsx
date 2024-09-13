'use client';
import { FunctionComponent, useEffect, useState } from 'react';

const PrintWrapper: FunctionComponent = () => {
  const [LayersPage, setLayersPage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const newPage = (await import('./PrintPage')).default;
        setLayersPage(() => newPage);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !LayersPage) {
    return null;
  }

  return LayersPage ? <LayersPage /> : null;
};

export default PrintWrapper;
