'use client';
import { FunctionComponent, useEffect, useState } from 'react';
import type { EinsatzTagebuchOptions } from './EinsatzTagebuch';

const EinsatzTagebuchWrapper: FunctionComponent<EinsatzTagebuchOptions> = (
  props,
) => {
  const [LayersPage, setLayersPage] =
    useState<FunctionComponent<EinsatzTagebuchOptions>>();

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

  return LayersPage ? <LayersPage {...props} /> : null;
};

export default EinsatzTagebuchWrapper;
