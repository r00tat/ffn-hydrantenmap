'use client';

import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';
import { CircleMarker, LayerGroup, Polyline, Popup, Tooltip } from 'react-leaflet';
import {
  HoseLineDraft,
  hoseLineDraftLabel,
  hoseLineDraftMidpoint,
} from '../../../common/waterSupply';
import { useHoseLineDraft } from '../../../hooks/useHoseLineDraft';
import { useMapEditable } from '../../../hooks/useMapEditor';

const DRAFT_COLOR = '#1976d2';

interface DraftLineProps {
  draft: HoseLineDraft;
  /** Der kürzeste Vorschlag wird hervorgehoben und beschriftet. */
  primary: boolean;
  onConfirm: (id: string) => void;
  onDiscard: (id: string) => void;
}

function DraftLine({ draft, primary, onConfirm, onDiscard }: DraftLineProps) {
  const t = useTranslations('ai');

  return (
    <>
      {/* Breite, blasse Spur unter der Linie: hebt den Entwurf von Straßen
          und bestehenden Leitungen ab, ohne die Karte zu verdecken. */}
      <Polyline
        positions={draft.positions}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: primary ? 12 : 8,
          opacity: primary ? 0.2 : 0.12,
          interactive: false,
        }}
      />
      <Polyline
        positions={draft.positions}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: primary ? 4 : 3,
          opacity: primary ? 0.95 : 0.55,
          dashArray: '12 10',
        }}
      >
        <Tooltip sticky>
          {draft.name} — {hoseLineDraftLabel(draft)}
        </Tooltip>
        <Popup>
          <Typography variant="subtitle2">{draft.name}</Typography>
          <Typography variant="body2">{hoseLineDraftLabel(draft)}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => onConfirm(draft.id)}
            >
              {t('draftConfirm')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onDiscard(draft.id)}
            >
              {t('draftDiscard')}
            </Button>
          </Stack>
        </Popup>
      </Polyline>

      {/* Etikett nur am kürzesten Vorschlag — bei mehreren Linien auf denselben
          Punkt lägen sonst alle Etiketten übereinander. */}
      {primary && (
        <CircleMarker
          center={hoseLineDraftMidpoint(draft)}
          radius={1}
          pathOptions={{ opacity: 0, fillOpacity: 0, interactive: false }}
        >
          <Tooltip permanent direction="center" offset={[0, 0]}>
            {hoseLineDraftLabel(draft)}
          </Tooltip>
        </CircleMarker>
      )}

      {/* Entnahmestelle gefüllt — die Fließrichtung ist im Einsatz die
          Information, nicht die bloße Lage der Endpunkte. */}
      <CircleMarker
        center={draft.positions[0]}
        radius={primary ? 8 : 6}
        pathOptions={{
          color: DRAFT_COLOR,
          weight: primary ? 3 : 2,
          fillColor: DRAFT_COLOR,
          fillOpacity: primary ? 0.9 : 0.55,
        }}
      >
        <Tooltip>{draft.source?.name || draft.name}</Tooltip>
      </CircleMarker>
    </>
  );
}

/**
 * Zeichnet die noch nicht bestätigten Leitungsvorschläge des KI-Assistenten —
 * gestrichelt, den kürzesten hervorgehoben und beschriftet. Übernommen oder
 * verworfen wird je Linie über ihr Popup oder für alle über den Toast des
 * Assistenten.
 */
export default function HoseLineDraftLayer() {
  const { drafts, confirmDraft, discardDraft, discardAllDrafts } =
    useHoseLineDraft();
  const editable = useMapEditable();

  // Die Knöpfe für „alle übernehmen" hängen am Assistenten-Toast, und der
  // verschwindet mit dem Bearbeitungsmodus. Liegengebliebene Vorschläge wären
  // dann nur noch einzeln zu beantworten — also verfallen sie.
  useEffect(() => {
    if (!editable && drafts.length > 0) {
      discardAllDrafts();
    }
  }, [discardAllDrafts, drafts.length, editable]);

  const handleConfirm = useCallback(
    (id: string) => {
      confirmDraft(id).catch((err) =>
        console.error('failed to confirm hose line draft', err)
      );
    },
    [confirmDraft]
  );

  if (!editable || drafts.length === 0) return null;

  const target = drafts[0].positions[drafts[0].positions.length - 1];

  return (
    <LayerGroup>
      {drafts.map((draft, index) => (
        <DraftLine
          key={draft.id}
          draft={draft}
          primary={index === 0}
          onConfirm={handleConfirm}
          onDiscard={discardDraft}
        />
      ))}
      {/* Gemeinsames Ziel, hohl gezeichnet. */}
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
