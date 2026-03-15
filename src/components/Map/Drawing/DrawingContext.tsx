'use client';

import {
  addDoc,
  collection,
  doc,
  writeBatch,
} from 'firebase/firestore';
import React, {
  FC,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { firestore } from '../../firebase/firebase';
import {
  DrawingStroke,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
} from '../../firebase/firestore';
import useFirebaseLogin from '../../../hooks/useFirebaseLogin';
import { useFirecallId } from '../../../hooks/useFirecall';

interface DrawingSessionItem {
  name: string;
  layer?: string;
}

interface DrawingContextValue {
  isDrawing: boolean;
  activeColor: string;
  activeWidth: number;
  strokes: DrawingStroke[];
  sessionItem?: DrawingSessionItem;
  startDrawing: (item: DrawingSessionItem) => void;
  commitStroke: (simplifiedPoints: [number, number][]) => void;
  undoLastStroke: () => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  save: () => Promise<void>;
  cancel: () => void;
}

export const DrawingContext = createContext<DrawingContextValue>(
  {} as DrawingContextValue
);

export const useDrawingProvider = (): DrawingContextValue => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeColor, setActiveColor] = useState('#ff0000');
  const [activeWidth, setActiveWidth] = useState(5);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [sessionItem, setSessionItem] = useState<DrawingSessionItem>();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const startDrawing = useCallback((item: DrawingSessionItem) => {
    setSessionItem(item);
    setStrokes([]);
    setIsDrawing(true);
  }, []);

  const commitStroke = useCallback(
    (simplifiedPoints: [number, number][]) => {
      if (simplifiedPoints.length < 2) return;
      setStrokes((prev) => {
        const newStroke: DrawingStroke = {
          color: activeColor,
          width: activeWidth,
          points: simplifiedPoints,
          order: prev.length, // index in the array = stable render order
        };
        return [...prev, newStroke];
      });
    },
    [activeColor, activeWidth]
  );

  const undoLastStroke = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const setColor = useCallback((color: string) => setActiveColor(color), []);
  const setWidth = useCallback((width: number) => setActiveWidth(width), []);

  const save = useCallback(async () => {
    if (!sessionItem || strokes.length === 0) return;
    if (!firecallId || firecallId === 'unknown') return;

    // Compute centroid from all points
    const allPoints = strokes.flatMap((s) => s.points);
    const lat = allPoints.reduce((sum, [la]) => sum + la, 0) / allPoints.length;
    const lng = allPoints.reduce((sum, [, ln]) => sum + ln, 0) / allPoints.length;

    try {
      // Write parent item
      const itemRef = await addDoc(
        collection(firestore, FIRECALL_COLLECTION_ID, firecallId, FIRECALL_ITEMS_COLLECTION_ID),
        {
          type: 'drawing',
          name: sessionItem.name,
          lat,
          lng,
          layer: sessionItem.layer || '',
          created: new Date().toISOString(),
          creator: email,
          deleted: false,
        }
      );

      // Batch-write strokes to subcollection
      const batch = writeBatch(firestore);
      for (const stroke of strokes) {
        const strokeRef = doc(
          collection(firestore, FIRECALL_COLLECTION_ID, firecallId, FIRECALL_ITEMS_COLLECTION_ID, itemRef.id, 'stroke')
        );
        batch.set(strokeRef, stroke);
      }
      await batch.commit();

      setIsDrawing(false);
      setStrokes([]);
      setSessionItem(undefined);
    } catch (error) {
      console.error('Failed to save drawing:', error);
      // Keep drawing mode open so user can retry
    }
  }, [sessionItem, strokes, firecallId, email]);

  const cancel = useCallback(() => {
    setIsDrawing(false);
    setStrokes([]);
    setSessionItem(undefined);
  }, []);

  return {
    isDrawing,
    activeColor,
    activeWidth,
    strokes,
    sessionItem,
    startDrawing,
    commitStroke,
    undoLastStroke,
    setColor,
    setWidth,
    save,
    cancel,
  };
};

export interface DrawingProviderProps {
  children: ReactNode;
}

export const DrawingProvider: FC<DrawingProviderProps> = ({ children }) => {
  const drawing = useDrawingProvider();
  return (
    <DrawingContext.Provider value={drawing}>{children}</DrawingContext.Provider>
  );
};

export const useDrawing = () => useContext(DrawingContext);
