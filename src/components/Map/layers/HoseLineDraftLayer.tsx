'use client';

import { useEffect } from 'react';
import { CircleMarker, LayerGroup, Polyline, Tooltip } from 'react-leaflet';
import { describeHoseLineDraft } from '../../../common/waterSupply';
import { useHoseLineDraft } from '../../../hooks/useHoseLineDraft';
import { useMapEditable } from '../../../hooks/useMapEditor';

/**
 * Zeichnet den noch nicht bestätigten Leitungsvorschlag des KI-Assistenten —
 * gestrichelt und halbtransparent, damit er sich von einer tatsächlich
 * angelegten Leitung unterscheidet. Bestätigt wird über den Toast des
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

  const [start] = draft.positions;
  const end = draft.positions[draft.positions.length - 1];

  return (
    <LayerGroup>
      <Polyline
        positions={draft.positions}
        pathOptions={{
          color: '#1976d2',
          weight: 5,
          opacity: 0.8,
          dashArray: '12 10',
        }}
      >
        <Tooltip sticky>
          Vorschlag: {describeHoseLineDraft(draft)}
        </Tooltip>
      </Polyline>
      {[start, end].map((position, index) => (
        <CircleMarker
          key={`hose-line-draft-point-${index}`}
          center={position}
          radius={7}
          pathOptions={{
            color: '#1976d2',
            weight: 3,
            fillColor: '#ffffff',
            fillOpacity: 0.9,
          }}
        />
      ))}
    </LayerGroup>
  );
}
