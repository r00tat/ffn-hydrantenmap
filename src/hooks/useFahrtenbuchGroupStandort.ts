'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { GeoPositionObject } from '../common/geo';
import { firestore } from '../components/firebase/firebase';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import { defaultPosition } from './constants';

export interface UseFahrtenbuchGroupStandortResult {
  /** Immer gesetzt — ohne gepflegten Standort das voreingestellte Feuerwehrhaus. */
  standort: GeoPositionObject;
  /** Ob der Wert aus dem Gruppen-Dokument stammt. */
  configured: boolean;
}

/**
 * Der Standort des Feuerwehrhauses einer Gruppe. Fällt auf `defaultPosition`
 * zurück, damit die Schätzung der Einsatzkilometer auch ohne Konfiguration
 * funktioniert — dieselbe Rückfallebene gilt in der Server Action.
 */
const FALLBACK: UseFahrtenbuchGroupStandortResult = {
  standort: defaultPosition,
  configured: false,
};

export default function useFahrtenbuchGroupStandort(
  groupId?: string,
): UseFahrtenbuchGroupStandortResult {
  const [snapshotResult, setSnapshotResult] =
    useState<UseFahrtenbuchGroupStandortResult>(FALLBACK);

  useEffect(() => {
    // Ohne Gruppe gibt es nichts zu abonnieren — der Rückgabewert fällt
    // während des Renderns unten auf den Standardstandort zurück, ein
    // `setState` hier wäre ein unnötiger zusätzlicher Render.
    if (!groupId) return;

    const unsubscribe = onSnapshot(
      doc(firestore, GROUP_COLLECTION_ID, groupId),
      (snapshot) => {
        const standort = snapshot.data()?.standort as
          | GeoPositionObject
          | undefined
          | null;
        setSnapshotResult(
          standort ? { standort, configured: true } : FALLBACK,
        );
      },
      (err) => {
        console.error('useFahrtenbuchGroupStandort failed', err);
        setSnapshotResult(FALLBACK);
      },
    );

    return () => unsubscribe();
  }, [groupId]);

  return groupId ? snapshotResult : FALLBACK;
}
