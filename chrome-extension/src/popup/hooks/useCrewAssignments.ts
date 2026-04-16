import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import {
  CrewAssignment,
  FIRECALL_COLLECTION_ID,
  FIRECALL_CREW_COLLECTION_ID,
} from '@shared/types';

export function useCrewAssignments(firecallId: string | null) {
  const [crew, setCrew] = useState<CrewAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firecallId) return;

    const q = query(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_CREW_COLLECTION_ID
      )
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const assignments = snapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id }) as CrewAssignment
        );
        setCrew(assignments);
        setLoading(false);
      },
      (error) => {
        console.error('CrewAssignments subscription error:', error);
        setCrew([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [firecallId]);

  if (!firecallId) {
    return { crew: [] as CrewAssignment[], loading: false };
  }
  return { crew, loading };
}
