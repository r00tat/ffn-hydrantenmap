'use client';

import type { Connection } from '../../firebase/firestore';
import RechnerMap from '../RechnerMap';
import VersorgungLeitungenLayer from './VersorgungLeitungenLayer';

/**
 * Die Karte der Seite „Löschwasserversorgung": die schmale Rechnerkarte mit den
 * Leitungen darauf.
 *
 * Der Rahmen — Grundkarten, Maßstab, Einrücken, Zeichenwerkzeug — steckt in
 * `RechnerMap` und ist mit der Seite „Dammbau" geteilt.
 */

export interface VersorgungMapProps {
  connections: Connection[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function VersorgungMap({
  connections,
  selectedId,
  onSelect,
}: VersorgungMapProps) {
  return (
    <RechnerMap items={connections}>
      <VersorgungLeitungenLayer
        connections={connections}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </RechnerMap>
  );
}
