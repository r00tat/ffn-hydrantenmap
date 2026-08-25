'use client';

import type { Wasserstand } from '../../firebase/firestore';
import RechnerMap from '../RechnerMap';
import WasserstandFlaechenLayer from './WasserstandFlaechenLayer';

/**
 * Die Karte der Seite „Hochwasser": die schmale Rechnerkarte mit den
 * Szenarien darauf. Der Rahmen steckt in `RechnerMap` und ist mit
 * „Dammbau" und „Löschwasserversorgung" geteilt.
 */
export interface WasserstandMapProps {
  szenarien: Wasserstand[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function WasserstandMap({
  szenarien,
  selectedId,
  onSelect,
}: WasserstandMapProps) {
  return (
    <RechnerMap items={szenarien}>
      <WasserstandFlaechenLayer
        szenarien={szenarien}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </RechnerMap>
  );
}
