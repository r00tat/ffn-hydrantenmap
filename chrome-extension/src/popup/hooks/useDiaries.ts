import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import {
  Diary,
  FirecallItem,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '@shared/types';

export function useDiaries(firecallId: string | null) {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firecallId) return;

    // Fetch all items and filter client-side (same as main app)
    const unsubscribe = onSnapshot(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID
      ),
      (snapshot) => {
        const entries = snapshot.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }) as FirecallItem)
          .filter((d): d is Diary => d.type === 'diary' && d.deleted !== true)
          .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
        // Assign sequential numbers by chronological order
        const sorted = [...entries].sort((a, b) =>
          (a.datum || '').localeCompare(b.datum || '')
        );
        sorted.forEach((entry, idx) => {
          entry.nummer = idx + 1;
        });
        setDiaries(entries);
        setLoading(false);
      },
      (error) => {
        console.error('Diaries subscription error:', error);
        setDiaries([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [firecallId]);

  // Without a firecall, derive an empty, non-loading state directly so we
  // never call setState from the effect body on the early-return branch.
  if (!firecallId) {
    return { diaries: [] as Diary[], loading: false };
  }
  return { diaries, loading };
}
