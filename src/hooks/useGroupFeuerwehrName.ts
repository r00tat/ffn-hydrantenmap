'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';

/**
 * Der Name der eigenen Feuerwehr einer Gruppe.
 *
 * Eigener Hook statt einer Erweiterung von `useFahrtenbuchGroupStandort`: Der
 * Standort hat eine Rückfallebene (`defaultPosition`), der Name hat keine —
 * ohne gepflegten Wert wird nichts vorbelegt, und `undefined` ist genau diese
 * Aussage.
 */
export default function useGroupFeuerwehrName(
  groupId?: string,
): string | undefined {
  // Die Gruppe steht mit im State, statt sie beim Wechsel im Effekt-Rumpf
  // zurückzusetzen: Ein `setState` dort löst eine Kaskade aus (ESLint
  // `react-hooks/set-state-in-effect`), und bis der neue Snapshot da ist,
  // stünde ohnehin noch der Name der alten Gruppe da.
  const [geladen, setGeladen] = useState<{
    groupId: string;
    name?: string;
  }>();

  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = onSnapshot(
      doc(firestore, GROUP_COLLECTION_ID, groupId),
      (snapshot) => {
        const value = snapshot.data()?.feuerwehrName;
        setGeladen({
          groupId,
          name:
            typeof value === 'string' && value.trim()
              ? value.trim()
              : undefined,
        });
      },
      (err) => {
        console.error('useGroupFeuerwehrName failed', err);
        setGeladen({ groupId });
      },
    );
    return () => unsubscribe();
  }, [groupId]);

  if (!groupId || !geladen || geladen.groupId !== groupId) return undefined;
  return geladen.name;
}
