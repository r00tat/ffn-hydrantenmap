'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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

  const records = useFirebaseCollection<FirecallLocation>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: collectionPath,
    filterFn: (loc) => loc.deleted !== true,
  });

  const locations = useMemo(
    () =>
      [...records].sort(
        (a, b) =>
          new Date(a.created || 0).getTime() - new Date(b.created || 0).getTime()
      ),
    [records]
  );

  const addLocation = useCallback(
    async (location: Partial<FirecallLocation>): Promise<string> => {
      const newData: FirecallLocation = {
        ...defaultFirecallLocation,
        ...location,
        created: new Date().toISOString(),
        creator: email || '',
      } as FirecallLocation;

      const docRef = await addDoc(
        collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_LOCATIONS_COLLECTION_ID
        ),
        newData
      );
      return docRef.id;
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
