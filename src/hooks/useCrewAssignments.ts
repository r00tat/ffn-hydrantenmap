'use client';

import { useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  Query,
} from 'firebase/firestore';
import { addDocLocal, deleteDocLocal, updateDocLocal } from '../lib/firestoreClient';
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
import {
  collectConfirmedPersons,
  CrewRecipient,
  planCrewSync,
} from '../common/crewMerge';

export type BlaulichtSmsRecipient = CrewRecipient;

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
  // with the realtime listener. Unions confirmed (yes) recipients across ALL
  // assigned alarms — über den normalisierten Namen, weil BlaulichtSMS die
  // Empfänger-ID je Alarm vergibt (#835) — und führt Duplikate zusammen.
  const syncFromAlarms = useCallback(
    async (alarms: BlaulichtSmsAlarm[]) => {
      if (!crewCollectionRef) return;

      const confirmed = collectConfirmedPersons(alarms);
      if (confirmed.length === 0) return;

      // Read current state directly from Firestore
      const snapshot = await getDocs(
        query(crewCollectionRef) as Query<CrewAssignment>
      );
      const plan = planCrewSync(
        snapshot.docs.map((d) => ({ id: d.id, data: d.data() })),
        confirmed
      );

      const crewDoc = (id: string) =>
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_CREW_COLLECTION_ID,
          id
        );
      const now = new Date().toISOString();

      // Erst die Zuteilungen auf den behaltenen Eintrag holen, dann die
      // Duplikate löschen — so geht auch bei einem Abbruch nichts verloren.
      // Lokal geschrieben: Firestore hält die Reihenfolge der Schreibvorgänge
      // ein, auch wenn sie erst beim Reconnect zum Server gehen.
      for (const { id, changes } of plan.updates) {
        updateDocLocal(crewDoc(id), {
          ...changes,
          updatedAt: now,
          updatedBy: email || '',
        });
      }
      for (const id of plan.deleteIds) {
        deleteDocLocal(crewDoc(id));
      }

      for (const r of plan.create) {
        addDocLocal(crewCollectionRef, {
          recipientId: r.id,
          name: r.name,
          vehicleId: null,
          vehicleName: '',
          funktion: 'Feuerwehrmann' as CrewFunktion,
          source: 'alarm' as const,
          updatedAt: now,
          updatedBy: email || '',
        });
      }
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
      updateDocLocal(docRef, {
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
      updateDocLocal(docRef, {
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
      addDocLocal(crewCollectionRef, {
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

      addDocLocal(crewCollectionRef, {
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
      deleteDocLocal(docRef);
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
