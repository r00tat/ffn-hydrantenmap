'use client';

import { FunctionComponent, useEffect, useState } from 'react';

const EinsatzorteWrapper: FunctionComponent = () => {
  const [EinsatzortePage, setEinsatzortePage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const pageComponent = (await import('./Einsatzorte')).default;
        setEinsatzortePage(() => pageComponent);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !EinsatzortePage) {
    return null;
  }

  return EinsatzortePage ? <EinsatzortePage /> : null;
};

export default EinsatzorteWrapper;
