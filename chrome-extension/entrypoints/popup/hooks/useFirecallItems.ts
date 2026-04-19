import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { firestore } from '@shared/firebase';
import {
  FirecallItem,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '@shared/types';

export function useFirecallItems(firecallId: string | null) {
  const [items, setItems] = useState<FirecallItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firecallId) return;

    const q = query(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        FIRECALL_ITEMS_COLLECTION_ID
      )
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allItems = snapshot.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }) as FirecallItem)
          .filter((item) => item.deleted !== true);
        setItems(allItems);
        setLoading(false);
      },
      (error) => {
        console.error('FirecallItems subscription error:', error);
        setItems([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [firecallId]);

  // Without a firecall, derive an empty, non-loading state directly so we
  // never call setState from the effect body on the early-return branch.
  if (!firecallId) {
    return { items: [] as FirecallItem[], loading: false };
  }
  return { items, loading };
}
