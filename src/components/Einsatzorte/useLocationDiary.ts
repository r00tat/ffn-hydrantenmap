'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import useVehicles from '../../hooks/useVehicles';
import { Diary } from '../firebase/firestore';

/**
 * Schreibt einen nummerierten Einsatztagebuch-Eintrag (Art „M") zu einem
 * Einsatzort.
 *
 * Die Nummer ist die Zahl der nummerierten Einträge plus eins. Ein Ref zählt
 * mit, damit mehrere Einträge aus einem Vorgang — etwa „abgezogen" und
 * „zugeordnet" beim Wechsel des Einsatzorts — nicht dieselbe Nummer bekommen,
 * bevor der Snapshot die ersten zurückliefert.
 */
export default function useLocationDiary() {
  const addFirecallItem = useFirecallItemAdd();
  const { firecallItems } = useVehicles();

  const diaryCounter = useMemo(
    () =>
      firecallItems.filter((f) => f.type === 'diary' && (f as Diary).nummer)
        .length + 1,
    [firecallItems],
  );
  const diaryCounterRef = useRef(diaryCounter);
  useEffect(() => {
    diaryCounterRef.current = diaryCounter;
  }, [diaryCounter]);

  return useCallback(
    (name: string, beschreibung?: string) => {
      const nummer = diaryCounterRef.current++;
      return addFirecallItem({
        type: 'diary',
        art: 'M',
        nummer,
        name,
        beschreibung: beschreibung || '',
      } as Diary).catch(() => {});
    },
    [addFirecallItem],
  );
}
