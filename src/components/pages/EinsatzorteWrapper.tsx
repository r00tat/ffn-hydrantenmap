'use client';

import { FunctionComponent, useEffect, useState } from 'react';
import type { EinsatzorteProps } from './Einsatzorte';

const EinsatzorteWrapper: FunctionComponent<EinsatzorteProps> = (props) => {
  const [EinsatzortePage, setEinsatzortePage] =
    useState<FunctionComponent<EinsatzorteProps>>();

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

  return EinsatzortePage ? <EinsatzortePage {...props} /> : null;
};

export default EinsatzorteWrapper;
