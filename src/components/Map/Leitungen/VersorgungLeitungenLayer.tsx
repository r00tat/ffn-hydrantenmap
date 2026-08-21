'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Marker, Polyline, Popup, Tooltip } from 'react-leaflet';
import type { Connection } from '../../firebase/firestore';
import { foerderungView } from '../../FirecallItems/elements/connection/foerderung/foerderung';
import { versorgungsart } from '../../FirecallItems/elements/connection/pendel/pendelRoute';
import { connectionDisplayPositions } from '../../FirecallItems/elements/connection/streetRouting';
import { leafletIcons } from '../../FirecallItems/icons';

/**
 * Die Leitungen auf der Karte der Seite „Löschwasserversorgung": jede
 * anklickbar, die gewählte hervorgehoben, dazu ihre Pumpenstandorte und die
 * Fahrtroute des Pendelverkehrs.
 *
 * Bewusst **nicht** `ConnectionComponent`: Die zeichnet auch die verschiebbaren
 * Punktmarker, das Punkt-Kontextmenü, den Bearbeiten-Knopf und ein eigenes
 * schwebendes Panel. Auf einer Rechenseite ist das alles nicht die Aufgabe —
 * hier wird eine Leitung ausgewählt, nicht bearbeitet. Wer sie ändern will, tut
 * das auf der Karte.
 */

export interface VersorgungLeitungenLayerProps {
  connections: Connection[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/** Die gewählte Leitung: kräftig. Die anderen: da, aber nicht im Weg. */
const SELECTED = { color: '#1565c0', weight: 6, opacity: 0.95 };
const OTHER = { color: '#1565c0', weight: 3, opacity: 0.35 };

export default function VersorgungLeitungenLayer({
  connections,
  selectedId,
  onSelect,
}: VersorgungLeitungenLayerProps) {
  const t = useTranslations('loeschwasserfoerderung');

  const selected = useMemo(
    () => connections.find((connection) => connection.id === selectedId),
    [connections, selectedId]
  );

  // Nur für die gewählte Leitung gerechnet: Pumpen und Fahrtroute aller
  // Leitungen übereinander wären auf einer Übersicht nicht zu lesen.
  const foerderung = useMemo(
    () => (selected ? foerderungView(selected) : undefined),
    [selected]
  );
  const mode = selected ? versorgungsart(selected) : 'foerderung';

  return (
    <>
      {connections.map((connection) => {
        const positions = connectionDisplayPositions(connection).filter(
          ([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
        );
        if (positions.length < 2) return null;

        return (
          <Polyline
            key={connection.id}
            positions={positions}
            pathOptions={
              connection.id === selectedId ? SELECTED : OTHER
            }
            eventHandlers={{
              click: () => connection.id && onSelect(connection.id),
            }}
          >
            <Tooltip sticky>
              {connection.name || t('subtitle')}
              {' — '}
              {Math.round(connection.distance ?? 0)} m
            </Tooltip>
          </Polyline>
        );
      })}

      {mode !== 'pendel' &&
        foerderung?.pumps.map((pump, index) => (
          <Marker
            key={`pumpe-${index}`}
            position={pump.position}
            icon={leafletIcons().pumpe}
            title={
              index === 0
                ? t('sourcePump')
                : t('pumpPopupTitle', { number: index })
            }
          >
            <Popup>
              <div>
                <strong>
                  {index === 0
                    ? t('sourcePump')
                    : t('pumpPopupTitle', { number: index })}
                </strong>
              </div>
              {t('pumpPopupDistance')}: {Math.round(pump.distance)} m
            </Popup>
          </Marker>
        ))}
    </>
  );
}
