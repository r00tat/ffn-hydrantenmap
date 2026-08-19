'use client';

import { useEffect } from 'react';
import { CircleMarker, LayerGroup, Polyline, Tooltip } from 'react-leaflet';
import {
  describeHoseLineDraft,
  hoseLineDraftLabel,
  hoseLineDraftMidpoint,
} from '../../../common/waterSupply';
import { useHoseLineDraft } from '../../../hooks/useHoseLineDraft';
import { useMapEditable } from '../../../hooks/useMapEditor';

const DRAFT_COLOR = '#1976d2';

/**
 * Zeichnet den noch nicht bestätigten Leitungsvorschlag des KI-Assistenten —
 * gestrichelt und mit fest eingeblendetem Etikett, damit Länge und
 * Schlauchanzahl ohne Hovern ablesbar sind. Bestätigt wird über den Toast des
 * Assistenten, nicht hier: Der Entwurf ist eine Anzeige, keine Bedienung.
 */
export default function HoseLineDraftLayer() {
  const { draft, discardDraft } = useHoseLineDraft();
  const editable = useMapEditable();

  // Der Bestätigen-Knopf hängt am Assistenten-Toast, und der verschwindet mit
  // dem Bearbeitungsmodus. Ein dann liegengebliebener Entwurf wäre nicht mehr
  // zu beantworten — also verfällt er.
  useEffect(() => {
    if (!editable && draft) {
      discardDraft();
    }
  }, [discardDraft, draft, editable]);

  if (!editable || !draft || draft.positions.length < 2) return null;

  const [source] = draft.positions;
  const target = draft.positions[draft.positions.length - 1];

  return (
    <LayerGroup>
      {/* Breite, blasse Spur unter der Linie: hebt den Entwurf von Straßen
          und bestehenden Leitungen ab, ohne die Karte zu verdecken. */}
      <Polyline
        positions={draft.positions}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: 12,
          opacity: 0.2,
          interactive: false,
        }}
      />
      <Polyline
        positions={draft.positions}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: 4,
          opacity: 0.95,
          dashArray: '12 10',
        }}
      >
        <Tooltip sticky>Vorschlag: {describeHoseLineDraft(draft)}</Tooltip>
      </Polyline>

      {/* Etikett an der Linie, dauerhaft sichtbar. */}
      <CircleMarker
        center={hoseLineDraftMidpoint(draft)}
        radius={1}
        pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
      >
        <Tooltip permanent direction="center" offset={[0, 0]}>
          {hoseLineDraftLabel(draft)}
        </Tooltip>
      </CircleMarker>

      {/* Entnahmestelle gefüllt, Ziel hohl — die Fließrichtung ist im Einsatz
          die Information, nicht die bloße Lage der Endpunkte. */}
      <CircleMarker
        center={source}
        radius={8}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: 3,
          fillColor: DRAFT_COLOR,
          fillOpacity: 0.9,
        }}
      >
        <Tooltip>{draft.source?.name || 'Entnahmestelle'}</Tooltip>
      </CircleMarker>
      <CircleMarker
        center={target}
        radius={7}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 0.9,
        }}
      />
    </LayerGroup>
  );
}
