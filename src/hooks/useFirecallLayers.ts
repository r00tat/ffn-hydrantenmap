'use client';

import React, { useContext, useMemo } from 'react';
import { SimpleMap } from '../common/types';
import {
  FIRECALL_COLLECTION_ID,
  FirecallLayer,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { orderBy } from 'firebase/firestore';

export type FirecallLayers = SimpleMap<FirecallLayer>;

export const FirecallLayersContext = React.createContext<FirecallLayers>({});

export const useFirecallLayers = () => {
  const layers = useContext(FirecallLayersContext);
  return layers;
};

export function useFirecallLayersFromFirstore(): FirecallLayers {
  const firecallId = useFirecallId();
  const layers = useFirebaseCollection<FirecallLayer>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, 'layer'],
    filterFn: filterActiveItems,
    queryConstraints: [orderBy('name', 'asc')],
  });

  return useMemo(
    () => Object.fromEntries(layers.map((l) => [l.id, l])),
    [layers]
  );
}
