'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  DEFAULT_GROUP_STAMMDATEN,
  GROUP_CONFIG_COLLECTION_ID,
  GROUP_STAMMDATEN_DOC,
  type GroupStammdaten,
} from '../common/groupStammdaten';
import { firestore } from '../components/firebase/firebase';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';

/**
 * Die Stammdaten einer Gruppe, mit den Vorgaben aufgefüllt.
 *
 * Gebaut wie `useAtemschutzRechnungConfig`: Der zwischengespeicherte Stand
 * trägt seine `groupId` mit, damit nach einem Gruppenwechsel nicht kurz die
 * Bankverbindung der vorigen Gruppe im Formular steht.
 */
export default function useGroupStammdaten(groupId?: string): GroupStammdaten {
  const [geladen, setGeladen] = useState<{
    groupId: string;
    stammdaten: GroupStammdaten;
  }>();

  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = onSnapshot(
      doc(
        firestore,
        GROUP_COLLECTION_ID,
        groupId,
        GROUP_CONFIG_COLLECTION_ID,
        GROUP_STAMMDATEN_DOC,
      ),
      (snapshot) => {
        setGeladen({
          groupId,
          stammdaten: { ...DEFAULT_GROUP_STAMMDATEN, ...(snapshot.data() ?? {}) },
        });
      },
      (err) => {
        console.error('useGroupStammdaten failed', err);
        setGeladen({ groupId, stammdaten: { ...DEFAULT_GROUP_STAMMDATEN } });
      },
    );
    return () => unsubscribe();
  }, [groupId]);

  if (!groupId || !geladen || geladen.groupId !== groupId) {
    return DEFAULT_GROUP_STAMMDATEN;
  }
  return geladen.stammdaten;
}
