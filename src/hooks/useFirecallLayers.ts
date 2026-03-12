'use client';

import { orderBy } from 'firebase/firestore';
import React, { useContext, useMemo } from 'react';
import { SimpleMap } from '../common/types';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FirecallLayer,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { useHistoryPathSegments } from './useMapEditor';

export type FirecallLayers = SimpleMap<FirecallLayer>;

export interface FirecallLayersContextValue {
  layersMap: FirecallLayers;
  sortedLayers: FirecallLayer[];
}

export const FirecallLayersContext =
  React.createContext<FirecallLayersContextValue>({
    layersMap: {},
    sortedLayers: [],
  });

/**
 * Returns the layers map (keyed by ID) for lookup.
 * Use `useFirecallLayersSorted` for ordered iteration.
 */
export const useFirecallLayers = (): FirecallLayers => {
  const { layersMap } = useContext(FirecallLayersContext);
  return layersMap;
};

/**
 * Returns layers sorted by zIndex ascending (lowest first = renders behind).
 */
export const useFirecallLayersSorted = (): FirecallLayer[] => {
  const { sortedLayers } = useContext(FirecallLayersContext);
  return sortedLayers;
};

export function sortByZIndex<T extends { zIndex?: number; datum?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const zA = a.zIndex ?? 0;
    const zB = b.zIndex ?? 0;
    if (zA !== zB) return zA - zB;
    return (a.datum ?? '').localeCompare(b.datum ?? '');
  });
}

export function useFirecallLayersFromFirstore(): FirecallLayersContextValue {
  const firecallId = useFirecallId();
  const historyPathSegments = useHistoryPathSegments();

  const layers = useFirebaseCollection<FirecallLayer>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_LAYERS_COLLECTION_ID,
    ],
    filterFn: filterActiveItems,
    queryConstraints: [orderBy('name', 'asc')],
  });

  return useMemo(() => {
    const layersMap = Object.fromEntries(layers.map((l) => [l.id, l]));
    const sortedLayers = sortByZIndex(layers);
    return { layersMap, sortedLayers };
  }, [layers]);
}
