'use client';

import AtemschutzPage from '../Atemschutz/AtemschutzPage';

/**
 * Wrapper für die Section-Registry — die lädt Komponenten ohne Props, der
 * aktive Einsatz kommt aus dem Context. Anders als `LoeschwasserversorgungWrapper`
 * kein Umweg über `useEffect`: Diese Seite trägt keine Leaflet-Karte und
 * greift damit nicht auf `window` zu.
 */
export default function AtemschutzWrapper() {
  return <AtemschutzPage />;
}
