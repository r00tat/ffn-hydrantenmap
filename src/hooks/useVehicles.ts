import { useEffect, useState } from 'react';
import {
  FirecallItem,
  Fzg,
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

  const firecallItems = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    pathSegments: [firecallId, 'item'],
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
            item?.type !== 'rohr' &&
            item.type !== 'vehicle' &&
            item.type !== 'diary'
        )
      );
    }
  }, [firecallItems]);

  return {
    vehicles,
    rohre,
    otherItems,
  };
}
