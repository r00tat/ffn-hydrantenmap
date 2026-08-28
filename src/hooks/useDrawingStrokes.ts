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
import { useHistoryPathSegments } from './useMapEditor';

export function useDrawingStrokes(itemId?: string): DrawingStroke[] {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const firecallId = useFirecallId();
  // Im History-Modus gehören die Striche zum Snapshot, nicht zum aktuellen
  // Stand — sonst zeigt eine alte Lage die Zeichnung von heute.
  const historyPathSegments = useHistoryPathSegments();
  const historyPath = historyPathSegments.join('/');

  useEffect(() => {
    if (!itemId || !firecallId || firecallId === 'unknown') return;

    const strokesRef = collection(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      ...(historyPath ? historyPath.split('/') : []),
      FIRECALL_ITEMS_COLLECTION_ID,
      itemId,
      'stroke'
    );
    const q = query(strokesRef, orderBy('order', 'asc'));

    getDocs(q)
      .then((snapshot) => {
        setStrokes(
          snapshot.docs.map((d) => {
            const raw = d.data() as Omit<DrawingStroke, 'points'> & {
              points: number[];
            };
            // Firestore stores points as flat [lat, lng, lat, lng, ...]
            const points: [number, number][] = [];
            for (let i = 0; i + 1 < raw.points.length; i += 2) {
              points.push([raw.points[i], raw.points[i + 1]]);
            }
            return { ...raw, points };
          })
        );
      })
      .catch((error) => {
        console.error('Failed to load drawing strokes:', error);
      });
  }, [itemId, firecallId, historyPath]);

  return strokes;
}
