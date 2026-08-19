'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Connection } from '../components/firebase/firestore';
import { HoseLineDraft } from '../common/waterSupply';
import useFirecallItemAdd from './useFirecallItemAdd';

export interface HoseLineDraftContextType {
  /** Die offenen Vorschläge, nach Entfernung sortiert; leer, wenn keiner aussteht. */
  drafts: HoseLineDraft[];
  /** Eine ganze Vorschlagsrunde anzeigen. Die vorherige Runde wird ersetzt. */
  proposeDrafts: (drafts: HoseLineDraft[]) => void;
  /** Einen Vorschlag als `connection` übernehmen; die übrigen bleiben stehen. */
  confirmDraft: (id: string) => Promise<string | undefined>;
  /** Alle Vorschläge übernehmen, gibt die Anzahl der angelegten Leitungen zurück. */
  confirmAllDrafts: () => Promise<number>;
  discardDraft: (id: string) => void;
  discardAllDrafts: () => void;
}

const noop = () => {};

/**
 * Ohne Provider sind die Entwürfe ein No-Op: Der KI-Assistent hängt auch in der
 * Tagebuch-Ansicht, und ein fehlender Provider darf ihn nicht mitreißen.
 */
export const HoseLineDraftContext = createContext<HoseLineDraftContextType>({
  drafts: [],
  proposeDrafts: noop,
  confirmDraft: async () => undefined,
  confirmAllDrafts: async () => 0,
  discardDraft: noop,
  discardAllDrafts: noop,
});

export function useHoseLineDraft(): HoseLineDraftContextType {
  return useContext(HoseLineDraftContext);
}

function toConnection(draft: HoseLineDraft): Connection {
  const [firstPosition] = draft.positions;
  const lastPosition = draft.positions[draft.positions.length - 1];

  return {
    type: 'connection',
    name: draft.name,
    beschreibung: draft.reason,
    dimension: draft.dimension,
    oneHozeLength: draft.oneHozeLength,
    lat: firstPosition[0],
    lng: firstPosition[1],
    destLat: lastPosition[0],
    destLng: lastPosition[1],
    positions: JSON.stringify(draft.positions),
    distance: draft.distance,
  };
}

export function useHoseLineDraftValue(): HoseLineDraftContextType {
  const [drafts, setDrafts] = useState<HoseLineDraft[]>([]);
  const addFirecallItem = useFirecallItemAdd();

  const proposeDrafts = useCallback((newDrafts: HoseLineDraft[]) => {
    setDrafts(newDrafts);
  }, []);

  const discardDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const discardAllDrafts = useCallback(() => setDrafts([]), []);

  const confirmDraft = useCallback(
    async (id: string) => {
      const draft = drafts.find((d) => d.id === id);
      if (!draft) return undefined;

      const ref = await addFirecallItem(toConnection(draft));
      // Erst nach dem erfolgreichen Anlegen entfernen — schlägt das Speichern
      // fehl, bleibt der Vorschlag für einen zweiten Versuch stehen.
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      return ref.id;
    },
    [addFirecallItem, drafts]
  );

  const confirmAllDrafts = useCallback(async () => {
    let created = 0;
    for (const draft of drafts) {
      // Nacheinander statt parallel: Jede Leitung schreibt ein Dokument und
      // einen Audit-Eintrag, und ein Fehler soll die übrigen nicht mitreißen.
      await addFirecallItem(toConnection(draft));
      created++;
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    }
    return created;
  }, [addFirecallItem, drafts]);

  return useMemo(
    () => ({
      drafts,
      proposeDrafts,
      confirmDraft,
      confirmAllDrafts,
      discardDraft,
      discardAllDrafts,
    }),
    [
      confirmAllDrafts,
      confirmDraft,
      discardAllDrafts,
      discardDraft,
      drafts,
      proposeDrafts,
    ]
  );
}
