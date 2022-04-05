import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import useFirecall from '../../../hooks/useFirecall';
import { filterDisplayableItems, FirecallItem } from '../../firebase/firestore';
import ItemOverlay from './ItemOverlay';
import FirecallItemMarker from './FirecallItemMarker';
import { useEffect, useState } from 'react';

export default function FirecallItems() {
  const firecall = useFirecall();
  const [firecallItem, setFirecallItem] = useState<FirecallItem>();
  const records = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    // queryConstraints: options.queryConstraints,
    pathSegments: [firecall?.id || 'unknown', 'item'],
    filterFn: filterDisplayableItems,
  });

  return (
    <>
      {records.map((record) => (
        <FirecallItemMarker
          record={record}
          key={record.id}
          selectItem={setFirecallItem}
        />
      ))}
      {firecallItem && (
        <ItemOverlay
          item={firecallItem}
          close={() => setFirecallItem(undefined)}
        />
      )}
    </>
  );
}
