'use client';

import type { Line } from '../../firebase/firestore';
import RechnerMap from '../RechnerMap';
import DammLinienLayer from './DammLinienLayer';

/**
 * Die Karte der Seite „Dammbau": die schmale Rechnerkarte mit den Dammlinien
 * darauf.
 *
 * Der Rahmen — Grundkarten, Maßstab, Einrücken, Zeichenwerkzeug — steckt in
 * `RechnerMap` und ist mit der Seite „Löschwasserversorgung" geteilt.
 */

export interface DammMapProps {
  linien: Line[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function DammMap({
  linien,
  selectedId,
  onSelect,
}: DammMapProps) {
  return (
    <RechnerMap items={linien}>
      <DammLinienLayer
        linien={linien}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </RechnerMap>
  );
}
