'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import type { FirecallSectionName } from '../../common/appShellRoutes';
import { parseFirecallSectionPath } from '../../common/firecallNavigation';
import DynamicMap from '../Map/DynamicMap';

export type FirecallSectionRegistry = Record<FirecallSectionName, ComponentType>;

// Die Schlüssel sind an `FIRECALL_SECTION_NAMES` gebunden: Ein Abschnitt, der
// dort fehlt, würde offline nicht vorgehalten (siehe appShellRoutes.ts).
const SECTIONS: FirecallSectionRegistry = {
  ebenen: dynamic(() => import('./LayersWrapper')),
  tagebuch: dynamic(() => import('./EinsatzTagebuchWrapper')),
  einsatzmittel: dynamic(() => import('./DynamicFahrzeuge')),
  geschaeftsbuch: dynamic(() => import('./GeschaeftsbuchWrapper')),
  einsatzorte: dynamic(() => import('./EinsatzorteWrapper')),
  chat: dynamic(() => import('./Chat')),
  print: dynamic(() => import('./PrintWrapper')),
  sybos: dynamic(() => import('./SybosWrapper')),
  details: dynamic(() => import('./EinsatzDetails')),
  fahrtenbuch: dynamic(() => import('../Fahrtenbuch/EinsatzFahrtenbuchSection')),
  loeschwasserversorgung: dynamic(() => import('./LoeschwasserversorgungWrapper')),
  dammbau: dynamic(() => import('./DammbauWrapper')),
  hochwasser: dynamic(() => import('./HochwasserWrapper')),
  atemschutz: dynamic(() => import('./AtemschutzWrapper')),
  atemschutzueberwachung: dynamic(() => import('./UeberwachungWrapper')),
  einsaetze: dynamic(() => import('./Einsaetze')),
};

/**
 * Karte oder Abschnitt eines Einsatzes, gewählt nach der Adresse. Beide Routen
 * unter `/einsatz/<id>` rendern diese Komponente; ein Wechsel per
 * `FirecallLink` ändert nur die Adresse — auch zu einem anderen Einsatz —,
 * und diese Komponente rendert neu
 * ohne Serverabruf (siehe `common/firecallNavigation.ts`).
 */
export default function FirecallView({
  sections = SECTIONS,
  map: MapComponent = DynamicMap,
}: {
  sections?: FirecallSectionRegistry;
  map?: ComponentType;
}) {
  const parsed = parseFirecallSectionPath(usePathname());
  if (!parsed) return null;
  if (parsed.section === '') return <MapComponent />;
  const Section = sections[parsed.section];
  return <Section />;
}
