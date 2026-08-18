'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Connection } from '../components/firebase/firestore';
import { HoseLineDraft } from '../common/waterSupply';
import useFirecallItemAdd from './useFirecallItemAdd';

export interface HoseLineDraftContextType {
  /** Der offene Vorschlag, oder `null`, wenn gerade keiner aussteht. */
  draft: HoseLineDraft | null;
  /** Vorschlag anzeigen. Ein vorheriger Vorschlag wird ersetzt. */
  proposeDraft: (draft: HoseLineDraft) => void;
  /** Vorschlag als `connection` in den Einsatz übernehmen. */
  confirmDraft: () => Promise<string | undefined>;
  discardDraft: () => void;
}

/**
 * Ohne Provider ist der Entwurf ein No-Op: Der KI-Assistent hängt auch in der
 * Tagebuch-Ansicht, und ein fehlender Provider darf ihn nicht mitreißen.
 */
export const HoseLineDraftContext = createContext<HoseLineDraftContextType>({
  draft: null,
  proposeDraft: () => {},
  confirmDraft: async () => undefined,
  discardDraft: () => {},
});

export function useHoseLineDraft(): HoseLineDraftContextType {
  return useContext(HoseLineDraftContext);
}

export function useHoseLineDraftValue(): HoseLineDraftContextType {
  const [draft, setDraft] = useState<HoseLineDraft | null>(null);
  const addFirecallItem = useFirecallItemAdd();

  const proposeDraft = useCallback((newDraft: HoseLineDraft) => {
    setDraft(newDraft);
  }, []);

  const discardDraft = useCallback(() => setDraft(null), []);

  const confirmDraft = useCallback(async () => {
    if (!draft) return undefined;
    const [firstPosition] = draft.positions;
    const lastPosition = draft.positions[draft.positions.length - 1];

    const item: Connection = {
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

    const ref = await addFirecallItem(item);
    setDraft(null);
    return ref.id;
  }, [addFirecallItem, draft]);

  return useMemo(
    () => ({ draft, proposeDraft, confirmDraft, discardDraft }),
    [confirmDraft, discardDraft, draft, proposeDraft]
  );
}
