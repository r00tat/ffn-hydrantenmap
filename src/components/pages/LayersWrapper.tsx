'use client';
import { FunctionComponent, useEffect, useState } from 'react';

const LayersWrapper: FunctionComponent = () => {
  const [LayersPage, setLayersPage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const newLayersPage = (await import('./Layers')).default;
        setLayersPage(() => newLayersPage);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !LayersPage) {
    return null;
  }

  return LayersPage ? <LayersPage /> : null;
};

export default LayersWrapper;
