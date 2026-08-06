'use client';

import { useMemo } from 'react';
import { orderBy } from 'firebase/firestore';
import {
  FAHRTENBUCH_VEHICLE_COLLECTION_ID,
  type FahrtenbuchVehicle,
} from '../common/fahrtenbuch';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';

export interface UseFahrtenbuchVehiclesResult {
  vehicles: FahrtenbuchVehicle[];
  activeVehicles: FahrtenbuchVehicle[];
  vehiclesById: Map<string, FahrtenbuchVehicle>;
}

export default function useFahrtenbuchVehicles(
  groupId?: string,
): UseFahrtenbuchVehiclesResult {
  const vehicles = useFirebaseCollection<FahrtenbuchVehicle>({
    // Empty string makes useFirebaseCollection build a null query and skip
    // the subscription entirely — an empty pathSegments array alone still
    // subscribes to the root `groups` collection, which no client may read.
    collectionName: groupId ? GROUP_COLLECTION_ID : '',
    pathSegments: groupId ? [groupId, FAHRTENBUCH_VEHICLE_COLLECTION_ID] : [],
    // Ordering by name (always present) instead of sortOrder: a vehicle
    // created without sortOrder (e.g. directly in the Firebase console)
    // would otherwise be silently dropped from every Fahrtenbuch view.
    queryConstraints: [orderBy('name', 'asc')],
  });

  return useMemo(() => {
    const list = groupId ? (vehicles ?? []) : [];
    const sorted = [...list].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    return {
      vehicles: sorted,
      activeVehicles: sorted.filter((v) => v.active !== false),
      vehiclesById: new Map(sorted.map((v) => [v.id as string, v])),
    };
  }, [groupId, vehicles]);
}
