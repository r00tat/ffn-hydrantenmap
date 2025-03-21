import { QueryConstraint } from 'firebase/firestore';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import {
  filterActiveItems,
  FIRECALL_COLLECTION_ID,
  FirecallItem,
} from './firestore';

export function useFirecallItems({
  queryConstraints = [],
}: {
  queryConstraints?: QueryConstraint[];
} = {}) {
  const firecallId = useFirecallId();
  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, 'item'],
    queryConstraints,
    filterFn: filterActiveItems,
  });
  return firecallItems;
}
