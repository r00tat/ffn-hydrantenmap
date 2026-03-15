'use client';

import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  DrawingStroke,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../components/firebase/firestore';
import { useFirecallId } from './useFirecall';

export function useDrawingStrokes(itemId?: string): DrawingStroke[] {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const firecallId = useFirecallId();

  useEffect(() => {
    if (!itemId || !firecallId || firecallId === 'unknown') return;

    const strokesRef = collection(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      FIRECALL_ITEMS_COLLECTION_ID,
      itemId,
      'stroke'
    );
    const q = query(strokesRef, orderBy('order', 'asc'));

    getDocs(q)
      .then((snapshot) => {
        setStrokes(snapshot.docs.map((doc) => doc.data() as DrawingStroke));
      })
      .catch((error) => {
        console.error('Failed to load drawing strokes:', error);
      });
  }, [itemId, firecallId]);

  return strokes;
}
