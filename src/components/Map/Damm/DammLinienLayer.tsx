'use client';

import { useTranslations } from 'next-intl';
import { Polyline, Tooltip } from 'react-leaflet';
import type { Line } from '../../firebase/firestore';
import { dammbauSummary } from '../../FirecallItems/elements/damm/sandsack';
import { connectionDisplayPositions } from '../../FirecallItems/elements/connection/streetRouting';

/**
 * Die Dammlinien auf der Karte der Seite „Dammbau": jede anklickbar, die
 * gewählte hervorgehoben.
 *
 * Bewusst **nicht** `ConnectionComponent`: Die zeichnet auch die verschiebbaren
 * Punktmarker, das Punkt-Kontextmenü, den Bearbeiten-Knopf und ein eigenes
 * schwebendes Panel. Auf einer Rechenseite ist das alles nicht die Aufgabe —
 * hier wird ein Abschnitt ausgewählt, nicht bearbeitet. Wer ihn ändern will,
 * tut das auf der Karte.
 *
 * Gleiche Aufteilung wie `VersorgungLeitungenLayer` an der Leitung.
 */

export interface DammLinienLayerProps {
  linien: Line[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/**
 * Der gewählte Abschnitt: kräftig. Die anderen: da, aber nicht im Weg. Braun
 * statt blau — ein Damm ist kein Wasser.
 */
const SELECTED = { color: '#8d6e63', weight: 7, opacity: 0.95 };
const OTHER = { color: '#8d6e63', weight: 3, opacity: 0.4 };

export default function DammLinienLayer({
  linien,
  selectedId,
  onSelect,
}: DammLinienLayerProps) {
  const t = useTranslations('dammbau');

  return (
    <>
      {linien.map((linie) => {
        const positions = connectionDisplayPositions(linie).filter(
          ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
        );
        if (positions.length < 2) return null;

        const summary = dammbauSummary(linie);

        return (
          <Polyline
            key={linie.id}
            positions={positions}
            pathOptions={linie.id === selectedId ? SELECTED : OTHER}
            eventHandlers={{
              click: () => linie.id && onSelect(linie.id),
            }}
          >
            <Tooltip sticky>
              {linie.name || t('subtitle')}
              {' — '}
              {Math.round(linie.distance ?? 0)} m
              {summary && ` — ${summary}`}
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}
