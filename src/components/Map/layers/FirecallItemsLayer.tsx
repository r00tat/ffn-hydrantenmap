import { where } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../../hooks/useFirecall';
import {
  filterDisplayableItems,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../../firebase/firestore';
import { getItemInstance } from '../../FirecallItems/elements';
import ItemOverlay from '../../FirecallItems/ItemOverlay';
import { useHistoryPathSegments } from '../../../hooks/useMapEditor';
import { sortByZIndex } from '../../../hooks/useFirecallLayers';

export interface FirecallLayerOptions {
  layer?: FirecallLayer;
  pane?: string;
}

function renderMarker(
  record: FirecallItem,
  setFirecallItem: (item: FirecallItem) => void,
  pane?: string
) {
  try {
    return getItemInstance(record).renderMarker(setFirecallItem, { pane });
  } catch (err) {
    console.error('Failed to render item ', record, err);
  }
  return <></>;
}

export default function FirecallItemsLayer({
  layer,
  pane,
}: FirecallLayerOptions) {
  const firecallId = useFirecallId();
  const [firecallItem, setFirecallItem] = useState<FirecallItem>();
  const historyPathSegments = useHistoryPathSegments();
  const queryConstraints = useMemo(
    () => (layer?.id ? [where('layer', '==', layer.id)] : []),
    [layer]
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
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn,
  });

  const sortedRecords = useMemo(() => sortByZIndex(records), [records]);

  return (
    <>
      {sortedRecords.map((record) => (
        <React.Fragment key={record.id}>
          <>{renderMarker(record, setFirecallItem, pane)}</>
        </React.Fragment>
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
