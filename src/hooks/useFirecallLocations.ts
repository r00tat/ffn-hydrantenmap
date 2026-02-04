'use client';

import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useCallback, useMemo } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_LOCATIONS_COLLECTION_ID,
  FirecallLocation,
  defaultFirecallLocation,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

/**
 * Migrate legacy string vehicles to string array.
 * Legacy Firestore documents may have vehicles as a comma-separated string.
 */
const migrateVehicles = (vehicles: string | string[] | undefined): string[] => {
  if (!vehicles) return [];
  if (Array.isArray(vehicles)) return vehicles;
  // Legacy string: split by comma, trim, filter empty
  return vehicles
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

export interface UseFirecallLocationsResult {
  locations: FirecallLocation[];
  loading: boolean;
  addLocation: (location: Partial<FirecallLocation>) => Promise<string>;
  updateLocation: (id: string, updates: Partial<FirecallLocation>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
}

export default function useFirecallLocations(): UseFirecallLocationsResult {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const collectionPath = useMemo(
    () => [firecallId, FIRECALL_LOCATIONS_COLLECTION_ID],
    [firecallId]
  );

  const filterFn = useCallback(
    (loc: FirecallLocation) => loc.deleted !== true,
    []
  );

  const records = useFirebaseCollection<FirecallLocation>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: collectionPath,
    filterFn,
  });

  const locations = useMemo(
    () =>
      [...records]
        .map((loc) => ({
          ...loc,
          vehicles: migrateVehicles(loc.vehicles as string | string[] | undefined),
        }))
        .sort(
          (a, b) =>
            new Date(a.created || 0).getTime() -
            new Date(b.created || 0).getTime()
        ),
    [records]
  );

  const addLocation = useCallback(
    async (location: Partial<FirecallLocation>): Promise<string> => {
      // Auto-set alarmTime to current time if not provided
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Use provided ID or generate one - this allows the UI to stay on the same element
      const locationId = location.id || doc(collection(firestore, '_')).id;

      const newData: FirecallLocation = {
        ...defaultFirecallLocation,
        ...location,
        id: locationId,
        alarmTime: location.alarmTime || currentTime,
        created: new Date().toISOString(),
        creator: email || '',
      } as FirecallLocation;

      const docRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_LOCATIONS_COLLECTION_ID,
        locationId
      );
      await setDoc(docRef, newData);
      return locationId;
    },
    [email, firecallId]
  );

  const updateLocation = useCallback(
    async (id: string, updates: Partial<FirecallLocation>): Promise<void> => {
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      };

      await updateDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_LOCATIONS_COLLECTION_ID,
          id
        ),
        updateData
      );
    },
    [email, firecallId]
  );

  const deleteLocation = useCallback(
    async (id: string): Promise<void> => {
      await updateDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_LOCATIONS_COLLECTION_ID,
          id
        ),
        { deleted: true, updatedAt: new Date().toISOString(), updatedBy: email }
      );
    },
    [email, firecallId]
  );

  return {
    locations,
    loading: false,
    addLocation,
    updateLocation,
    deleteLocation,
  };
}
