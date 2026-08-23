'use client';
import { FunctionComponent, useEffect, useState } from 'react';

/**
 * Lädt die Seite erst im Browser.
 *
 * Wie `LoeschwasserversorgungWrapper`: Die Seite trägt eine Leaflet-Karte, und
 * Leaflet greift auf `window` zu. Ein Import auf Modulebene brach das Rendern
 * auf dem Server ab. Der Umweg über `useEffect` ist das Muster, das dieses
 * Projekt dafür schon benutzt — kein `next/dynamic` im Kartenbaum, siehe
 * docs/loeschwasserfoerderung.md.
 */
const DammbauWrapper: FunctionComponent = () => {
  const [Page, setPage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const loaded = (await import('./Dammbau')).default;
        setPage(() => loaded);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !Page) {
    return null;
  }

  return <Page />;
};

export default DammbauWrapper;
