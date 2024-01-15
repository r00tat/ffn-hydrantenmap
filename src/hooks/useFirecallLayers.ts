import React, { useContext } from 'react';
import { SimpleMap } from '../common/types';
import {
  FirecallLayer,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { orderBy } from 'firebase/firestore';

export type FirecallLayers = SimpleMap<FirecallLayer>;

export const FirecallLayersContext = React.createContext<FirecallLayers>({});

export const useFirecallLayers = () => {
  const { layers } = useContext(FirecallLayersContext);
  return layers;
};

export function useFirecallLayersFromFirstore(): FirecallLayers {
  const firecallId = useFirecallId();
  const layers = useFirebaseCollection<FirecallLayer>({
    collectionName: 'call',
    pathSegments: [firecallId, 'layer'],
    filterFn: filterActiveItems,
    queryConstraints: [orderBy('name', 'asc')],
  });

  return { layers: Object.fromEntries(layers.map((l) => [l.id, l])) };
}
