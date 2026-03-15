'use client';

import {
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
  redoStack: DrawingStroke[];
  sessionItem?: DrawingSessionItem;
  startDrawing: (item: DrawingSessionItem) => void;
  commitStroke: (simplifiedPoints: [number, number][]) => void;
  undoLastStroke: () => void;
  redoLastStroke: () => void;
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
  const [redoStack, setRedoStack] = useState<DrawingStroke[]>([]);
  const [sessionItem, setSessionItem] = useState<DrawingSessionItem>();
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const startDrawing = useCallback((item: DrawingSessionItem) => {
    setSessionItem(item);
    setStrokes([]);
    setRedoStack([]);
    setIsDrawing(true);
  }, []);

  const commitStroke = useCallback(
    (simplifiedPoints: [number, number][]) => {
      if (simplifiedPoints.length < 2) return;
      setRedoStack([]); // new stroke clears redo history
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
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      setRedoStack((r) => [...r, removed]);
      return prev.slice(0, -1);
    });
  }, []);

  const redoLastStroke = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setStrokes((s) => [...s, { ...restored, order: s.length }]);
      return prev.slice(0, -1);
    });
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
      // Use a single batch for parent item + strokes to avoid race condition:
      // if written separately, the Firestore listener fires after addDoc and
      // DrawingComponent mounts before strokes exist, causing empty rendering.
      const itemRef = doc(
        collection(firestore, FIRECALL_COLLECTION_ID, firecallId, FIRECALL_ITEMS_COLLECTION_ID)
      );
      const batch = writeBatch(firestore);

      batch.set(itemRef, {
        type: 'drawing',
        name: sessionItem.name,
        lat,
        lng,
        layer: sessionItem.layer || '',
        created: new Date().toISOString(),
        creator: email,
        deleted: false,
      });

      // Firestore does not support nested arrays, so flatten points to [lat, lng, lat, lng, ...]
      for (const stroke of strokes) {
        const strokeRef = doc(
          collection(firestore, FIRECALL_COLLECTION_ID, firecallId, FIRECALL_ITEMS_COLLECTION_ID, itemRef.id, 'stroke')
        );
        batch.set(strokeRef, { ...stroke, points: stroke.points.flat() });
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
    setRedoStack([]);
    setSessionItem(undefined);
  }, []);

  return {
    isDrawing,
    activeColor,
    activeWidth,
    strokes,
    redoStack,
    sessionItem,
    startDrawing,
    commitStroke,
    undoLastStroke,
    redoLastStroke,
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
