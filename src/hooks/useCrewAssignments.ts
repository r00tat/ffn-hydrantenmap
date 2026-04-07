'use client';

import { useCallback, useMemo } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  Query,
  updateDoc,
} from 'firebase/firestore';
import { firestore } from '../components/firebase/firebase';
import {
  CrewAssignment,
  CrewFunktion,
  FIRECALL_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import useFirebaseLogin from './useFirebaseLogin';

export interface BlaulichtSmsRecipient {
  id: string;
  name: string;
  participation: 'yes' | 'no' | 'unknown' | 'pending';
}

export default function useCrewAssignments() {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const crewAssignments = useFirebaseCollection<CrewAssignment>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_CREW_COLLECTION_ID],
  });

  const crewCollectionRef = useMemo(
    () =>
      firecallId && firecallId !== 'unknown'
        ? collection(
            firestore,
            FIRECALL_COLLECTION_ID,
            firecallId,
            FIRECALL_CREW_COLLECTION_ID
          )
        : null,
    [firecallId]
  );

  // syncFromAlarm reads Firestore directly (getDocs) to avoid race conditions
  // with the realtime listener. Also cleans up duplicates from earlier bugs.
  const syncFromAlarm = useCallback(
    async (recipients: BlaulichtSmsRecipient[]) => {
      if (!crewCollectionRef) return;

      const confirmed = recipients.filter((r) => r.participation === 'yes');
      if (confirmed.length === 0) return;

      // Read current state directly from Firestore
      const snapshot = await getDocs(
        query(crewCollectionRef) as Query<CrewAssignment>
      );

      // Clean up duplicates: keep only the first doc per recipientId
      const seenIds = new Set<string>();
      const duplicateDocs: string[] = [];
      for (const d of snapshot.docs) {
        const rid = d.data().recipientId;
        if (seenIds.has(rid)) {
          duplicateDocs.push(d.id);
        } else {
          seenIds.add(rid);
        }
      }
      if (duplicateDocs.length > 0) {
        await Promise.all(
          duplicateDocs.map((id) =>
            deleteDoc(
              doc(
                firestore,
                FIRECALL_COLLECTION_ID,
                firecallId,
                FIRECALL_CREW_COLLECTION_ID,
                id
              )
            )
          )
        );
      }

      // Create docs for new confirmed recipients
      const newRecipients = confirmed.filter((r) => !seenIds.has(r.id));

      if (newRecipients.length === 0) return;

      const now = new Date().toISOString();
      await Promise.all(
        newRecipients.map((r) =>
          addDoc(crewCollectionRef, {
            recipientId: r.id,
            name: r.name,
            vehicleId: null,
            vehicleName: '',
            funktion: 'Feuerwehrmann' as CrewFunktion,
            updatedAt: now,
            updatedBy: email || '',
          })
        )
      );
    },
    [crewCollectionRef, email, firecallId]
  );

  const assignVehicle = useCallback(
    async (
      assignmentId: string,
      vehicleId: string | null,
      vehicleName: string
    ) => {
      if (!firecallId || firecallId === 'unknown') return;
      const docRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID,
        assignmentId
      );
      await updateDoc(docRef, {
        vehicleId,
        vehicleName,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      });
    },
    [firecallId, email]
  );

  const updateFunktion = useCallback(
    async (assignmentId: string, funktion: CrewFunktion) => {
      if (!firecallId || firecallId === 'unknown') return;
      const docRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID,
        assignmentId
      );
      await updateDoc(docRef, {
        funktion,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      });
    },
    [firecallId, email]
  );

  const removeAssignment = useCallback(
    async (assignmentId: string) => {
      if (!firecallId || firecallId === 'unknown') return;
      const docRef = doc(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID,
        assignmentId
      );
      await deleteDoc(docRef);
    },
    [firecallId]
  );

  return {
    crewAssignments,
    syncFromAlarm,
    assignVehicle,
    updateFunktion,
    removeAssignment,
  };
}
