'use client';

import { useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  Query,
} from 'firebase/firestore';
import { addDoc, deleteDoc, updateDoc } from '../lib/firestoreClient';
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
import { BlaulichtSmsAlarm } from '../app/blaulicht-sms/actions';

export interface BlaulichtSmsRecipient {
  id: string;
  name: string;
  participation: 'yes' | 'no' | 'unknown' | 'pending';
}

export default function useCrewAssignments(firecallIdOverride?: string) {
  const contextFirecallId = useFirecallId();
  const firecallId = firecallIdOverride ?? contextFirecallId;
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

  // syncFromAlarms reads Firestore directly (getDocs) to avoid race conditions
  // with the realtime listener. Also cleans up duplicates from earlier bugs.
  // Unions confirmed (yes) recipients across ALL assigned alarms.
  const syncFromAlarms = useCallback(
    async (alarms: BlaulichtSmsAlarm[]) => {
      if (!crewCollectionRef) return;

      // Union of yes recipients across all alarms, deduped by recipient id
      const confirmedById = new Map<string, BlaulichtSmsRecipient>();
      for (const alarm of alarms) {
        for (const r of alarm.recipients) {
          // First alarm that lists a recipient wins for name/details (later alarms don't overwrite).
          if (r.participation === 'yes' && !confirmedById.has(r.id)) {
            confirmedById.set(r.id, {
              id: r.id,
              name: r.name,
              participation: r.participation,
            });
          }
        }
      }
      const confirmed = [...confirmedById.values()];
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
            source: 'alarm' as const,
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

  const addManualPerson = useCallback(
    async (name: string) => {
      if (!crewCollectionRef || !name.trim()) return;
      await addDoc(crewCollectionRef, {
        recipientId: `manual-${Date.now()}`,
        name: name.trim(),
        vehicleId: null,
        vehicleName: '',
        funktion: 'Feuerwehrmann' as CrewFunktion,
        source: 'manual' as const,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      });
    },
    [crewCollectionRef, email]
  );

  const addPersonFromRecipient = useCallback(
    async (recipient: BlaulichtSmsRecipient) => {
      if (!crewCollectionRef) return;

      // Avoid duplicates: check current Firestore state for this recipient id
      const snapshot = await getDocs(
        query(crewCollectionRef) as Query<CrewAssignment>
      );
      if (snapshot.docs.some((d) => d.data().recipientId === recipient.id)) {
        return;
      }

      await addDoc(crewCollectionRef, {
        recipientId: recipient.id,
        name: recipient.name,
        vehicleId: null,
        vehicleName: '',
        funktion: 'Feuerwehrmann' as CrewFunktion,
        source: 'manual' as const,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      });
    },
    [crewCollectionRef, email]
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
    syncFromAlarms,
    addManualPerson,
    addPersonFromRecipient,
    assignVehicle,
    updateFunktion,
    removeAssignment,
  };
}
