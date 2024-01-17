import { useMemo, useState } from 'react';
import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import useFirecall from '../../../hooks/useFirecall';
import {
  filterDisplayableItems,
  FirecallItem,
  FirecallLayer,
} from '../../firebase/firestore';
import { getItemInstance } from '../../FirecallItems/elements';
import ItemOverlay from '../../FirecallItems/ItemOverlay';
import React from 'react';
import { where } from 'firebase/firestore';

export interface FirecallLayerOptions {
  layer?: FirecallLayer;
}

export default function FirecallItemsLayer({ layer }: FirecallLayerOptions) {
  const firecall = useFirecall();
  const [firecallItem, setFirecallItem] = useState<FirecallItem>();
  const queryConstraints = useMemo(
    () => (layer?.id ? [where('layer', '==', layer.id)] : []),
    [layer?.id]
  );
  const filterFn = useMemo(
    () =>
      layer?.id
        ? filterDisplayableItems
        : (e: FirecallItem) =>
            (e.layer === undefined || e.layer === '') &&
            filterDisplayableItems(e),
    [layer?.id]
  );
  const records = useFirebaseCollection<FirecallItem>({
    collectionName: 'call',
    queryConstraints,
    pathSegments: [firecall?.id || 'unknown', 'item'],
    filterFn,
  });

  return (
    <>
      {records.map(
        (record) => (
          <React.Fragment key={record.id}>
            {getItemInstance(record).renderMarker(setFirecallItem)}
          </React.Fragment>
        )
        // <FirecallItemMarker
        //   record={record}
        //   key={record.id}
        //   selectItem={setFirecallItem}
        // />
      )}
      {firecallItem && (
        <ItemOverlay
          item={firecallItem}
          close={() => setFirecallItem(undefined)}
        />
      )}
    </>
  );
}
