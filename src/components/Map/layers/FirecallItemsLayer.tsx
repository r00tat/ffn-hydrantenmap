import { where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
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
import { MarkerRenderOptions } from '../../FirecallItems/elements/marker/FirecallItemDefault';
import ItemOverlay from '../../FirecallItems/ItemOverlay';
import { useHistoryPathSegments } from '../../../hooks/useMapEditor';

export interface FirecallLayerOptions {
  layer?: FirecallLayer;
}

function renderMarker(
  record: FirecallItem,
  setFirecallItem: (item: FirecallItem) => void,
  options?: MarkerRenderOptions
) {
  try {
    const instance = getItemInstance(record);
    if (options?.dataSchema) {
      instance._renderDataSchema = options.dataSchema;
    }
    return instance.renderMarker(setFirecallItem, options);
  } catch (err) {
    console.error('Failed to render item ', record, err);
  }
  return <></>;
}

export default function FirecallItemsLayer({ layer }: FirecallLayerOptions) {
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

  return (
    <>
      {records.map(
        (record) => (
          <React.Fragment key={record.id}>
            <>{renderMarker(record, setFirecallItem, layer?.dataSchema ? { dataSchema: layer.dataSchema } : undefined)}</>
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
