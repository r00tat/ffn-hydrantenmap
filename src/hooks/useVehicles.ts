import { useEffect, useState } from 'react';
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

export default function useVehicles() {
  const firecallId = useFirecallId();
  // console.info(`firecall id ${firecallId}`);
  const [vehicles, setVehicles] = useState<Fzg[]>([]);
  const [rohre, setRohre] = useState<Rohr[]>([]);
  const [otherItems, setOtherItems] = useState<FirecallItem[]>([]);
  const [displayItems, setDisplayItems] = useState<FirecallItem[]>([]);

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: [firecallId, FIRECALL_ITEMS_COLLECTION_ID],
    // queryConstraints: [where('type', '==', 'vehicle')],
    filterFn: filterActiveItems,
  });

  useEffect(() => {
    if (firecallItems) {
      setVehicles(
        firecallItems.filter((item) => item?.type === 'vehicle') as Fzg[]
      );
      setRohre(firecallItems.filter((item) => item?.type === 'rohr') as Rohr[]);
      setOtherItems(
        firecallItems.filter(
          (item) =>
            NON_DISPLAYABLE_ITEMS.indexOf(item?.type || 'fallback') < 0 &&
            item?.type !== 'rohr' &&
            item.type !== 'vehicle' &&
            item.type !== 'diary'
        )
      );
      setDisplayItems(
        firecallItems.filter(
          (item) => NON_DISPLAYABLE_ITEMS.indexOf(item?.type || 'fallback') < 0
        )
      );
    }
  }, [firecallItems]);

  return {
    vehicles,
    rohre,
    otherItems,
    displayItems,
  };
}
