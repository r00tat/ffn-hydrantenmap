'use client';

import { useEffect, useMemo } from 'react';
import {
  warmFirecallCache,
  warmGroupCache,
  warmOnce,
} from '../lib/firestoreWarmup';
import useConnectivity from './useConnectivity';
import { useFirecall } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Wartezeit nach dem Öffnen, bevor vorgewärmt wird: Die Listener der Seite
 * sollen zuerst laden, das Vorwärmen läuft nachgelagert.
 */
export const FIRESTORE_WARMUP_DELAY_MS = 3_000;

/**
 * Wärmt den Firestore-Cache für den Offline-Fall vor
 * (`src/lib/firestoreWarmup.ts`): beim Öffnen eines Einsatzes dessen Daten,
 * dazu Gruppendaten, Einsatzliste und Hydranten-Cluster der Umgebung. Je
 * Einsatz bzw. Gruppenstand einmal im Seitenleben, nur online.
 */
export default function useFirestoreWarmup(): void {
  const { isAuthorized, hasFirebaseUser, groups } = useFirebaseLogin();
  // Nur die Erreichbarkeit zählt: `status` wechselt mit jedem Schreibvorgang
  // zwischen `online` und `syncing` und startete die Wartezeit sonst neu.
  const { reachable } = useConnectivity();
  const firecall = useFirecall();

  const firecallId =
    firecall?.id && firecall.id !== 'unknown' ? firecall.id : undefined;
  const groupId = firecallId ? firecall?.group : undefined;
  const lat = firecallId ? firecall?.lat : undefined;
  const lng = firecallId ? firecall?.lng : undefined;
  const groupsKey = (groups ?? []).join(',');
  const center = useMemo(
    () =>
      typeof lat === 'number' && typeof lng === 'number'
        ? { lat, lng }
        : undefined,
    [lat, lng]
  );

  useEffect(() => {
    if (!isAuthorized || !hasFirebaseUser || !reachable) return;

    const timer = setTimeout(() => {
      if (firecallId) {
        void warmOnce(`firecall:${firecallId}`, () =>
          warmFirecallCache(firecallId)
        );
      }
      const groupList = groupsKey ? groupsKey.split(',') : [];
      if (!groupId && groupList.length === 0 && !center) return;
      // Der Standort gehört zum Schlüssel auf rund einen Kilometer genau: Wird
      // der Einsatzort nachgetragen, kommen die Hydranten dort dazu.
      const where = center
        ? `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`
        : '';
      void warmOnce(`group:${groupId ?? ''}|${groupsKey}|${where}`, () =>
        warmGroupCache({ groupId, groups: groupList, center })
      );
    }, FIRESTORE_WARMUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAuthorized, hasFirebaseUser, reachable, firecallId, groupId, groupsKey, center]);
}
