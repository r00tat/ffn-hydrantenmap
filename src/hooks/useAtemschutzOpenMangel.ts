'use client';

import { useMemo } from 'react';
import {
  FAHRTENBUCH_MANGEL_COLLECTION_ID,
  isOpenMangel,
  mangelItemId,
  mangelItemType,
  type Mangel,
} from '../common/mangel';
import useGroupsCollection from './useGroupsCollection';

/**
 * Offene Mängel an Atemschutzausrüstung je Geräte-ID, über mehrere Gruppen.
 *
 * Das Gegenstück zu `useAtemschutzGeraete(groupIds)`: Ein Mangel liegt in der
 * Gruppe des Geräts, und wer eine Flasche aus einer anderen seiner Gruppen
 * ausgibt, soll ihren offenen Mangel trotzdem sehen. Der Typ wird wie in
 * `useFahrtenbuchMangel` im Speicher gefiltert, weil alte Dokumente kein
 * `itemType` tragen.
 */
export default function useAtemschutzOpenMangel(
  groupIds: readonly string[],
): Map<string, number> {
  const mangel = useGroupsCollection<Mangel>(
    groupIds,
    FAHRTENBUCH_MANGEL_COLLECTION_ID,
  );
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of mangel) {
      if (mangelItemType(item) !== 'atemschutz' || !isOpenMangel(item)) continue;
      const key = mangelItemId(item);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [mangel]);
}
