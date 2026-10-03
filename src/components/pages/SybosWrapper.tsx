'use client';
import { FunctionComponent, useEffect, useState } from 'react';

/**
 * Lädt die Sybos-Seite erst im Browser — wie `PrintWrapper`: Die Typnamen
 * des Materials kommen aus den Element-Klassen, und die ziehen Leaflet mit,
 * das beim Import auf `window` zugreift.
 */
const SybosWrapper: FunctionComponent = () => {
  const [Page, setPage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const loaded = (await import('./sybos/SybosPage')).default;
        setPage(() => loaded);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !Page) {
    return null;
  }

  return <Page />;
};

export default SybosWrapper;
