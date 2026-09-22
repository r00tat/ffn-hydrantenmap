'use client';

import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import { KostenersatzVehicle, KOSTENERSATZ_VEHICLES_COLLECTION } from '../common/kostenersatz';
import { getDefaultVehicles } from '../common/defaultKostenersatzRates';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Load all vehicles from Firestore
 * Falls back to default vehicles if none exist
 */
export function useKostenersatzVehicles() {
  const [firestoreVehicles, setFirestoreVehicles] = useState<KostenersatzVehicle[]>([]);
  const [firestoreLoading, setFirestoreLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Ohne angemeldeten Firebase-Benutzer ist `request.auth` null und jede Regel
  // verweigert den Zugriff. `isAuthorized` kommt aus dem NextAuth-Cookie und
  // steht schon, bevor der Firebase-Client seinen Benutzer hat — ohne diese
  // Bedingung liefe der Listener auf dem Login-Bildschirm in ein
  // `permission-denied`. Gleiche Absicherung wie in `useFirebaseCollection`.
  const { hasFirebaseUser } = useFirebaseLogin();

  useEffect(() => {
    if (!hasFirebaseUser) return;

    const q = query(
      collection(firestore, KOSTENERSATZ_VEHICLES_COLLECTION),
      orderBy('sortOrder', 'asc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const vehicleList: KostenersatzVehicle[] = [];
        snapshot.forEach((doc) => {
          vehicleList.push({
            id: doc.id,
            ...doc.data(),
          } as KostenersatzVehicle);
        });
        setFirestoreVehicles(vehicleList);
        setFirestoreLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz vehicles:', err);
        setError(err);
        setFirestoreLoading(false);
      },
    );

    return () => unsubscribe();
  }, [hasFirebaseUser]);

  // Use default vehicles if none in Firestore
  const vehicles = useMemo(() => {
    if (firestoreVehicles.length === 0) {
      return getDefaultVehicles();
    }
    return firestoreVehicles;
  }, [firestoreVehicles]);

  // Create lookup map by ID
  const vehiclesById = useMemo(() => {
    const map = new Map<string, KostenersatzVehicle>();
    vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  // Check if using Firestore or defaults
  const isUsingDefaults = firestoreVehicles.length === 0;

  return {
    vehicles,
    vehiclesById,
    // Ohne Abo kommt nie ein Snapshot, der `firestoreLoading` beendet — der
    // Ladezustand haengt deshalb mit am Benutzer und nicht nur am Snapshot.
    loading: hasFirebaseUser && firestoreLoading,
    error,
    isUsingDefaults,
  };
}
