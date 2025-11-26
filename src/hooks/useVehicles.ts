import { useMemo } from 'react';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  Fzg,
  NON_DISPLAYABLE_ITEMS,
  Rohr,
  filterActiveItems,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import { useFirecallId } from './useFirecall';
import { useHistoryPathSegments } from './useMapEditor';

export default function useVehicles() {
  const firecallId = useFirecallId();
  // console.info(`firecall id ${firecallId}`);
  const historyPathSegments = useHistoryPathSegments();

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    // queryConstraints: [where('type', '==', 'vehicle')],
    filterFn: filterActiveItems,
  });

  const vehicles = useMemo(
    () =>
      (firecallItems?.filter((item) => item?.type === 'vehicle') ||
        []) as Fzg[],
    [firecallItems]
  );

  const rohre = useMemo(
    () =>
      (firecallItems.filter((item) => item?.type === 'rohr') || []) as Rohr[],
    [firecallItems]
  );
  const otherItems = useMemo(
    () =>
      firecallItems?.filter(
        (item) =>
          NON_DISPLAYABLE_ITEMS.indexOf(item?.type || 'fallback') < 0 &&
          item?.type !== 'rohr' &&
          item.type !== 'vehicle' &&
          item.type !== 'diary'
      ) || [],
    [firecallItems]
  );

  const displayItems = useMemo(
    () =>
      firecallItems?.filter(
        (item) => NON_DISPLAYABLE_ITEMS.indexOf(item?.type || 'fallback') < 0
      ) || [],
    [firecallItems]
  );

  return {
    vehicles,
    rohre,
    otherItems,
    displayItems,
  };
}
