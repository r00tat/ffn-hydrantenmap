import { where } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback, useMemo, useState } from 'react';
import { getHeatmapColor } from '../../../common/heatmap';
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
import { useHistoryPathSegments, useMapEditable } from '../../../hooks/useMapEditor';
import useFirecallItemUpdate from '../../../hooks/useFirecallItemUpdate';
import { sortByZIndex } from '../../../hooks/useFirecallLayers';
import ZOrderContextMenu from '../../FirecallItems/ZOrderContextMenu';

export interface FirecallLayerOptions {
  layer?: FirecallLayer;
  pane?: string;
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

  const heatmapConfig = layer?.heatmapConfig;
  const dataSchema = layer?.dataSchema;
  const layerShowLabels =
    layer?.showLabels === undefined
      ? undefined
      : layer.showLabels === 'true' || layer.showLabels === true as any;

  const allValues = useMemo(() => {
    if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
    return records
      .map((r) => (r.fieldData as Record<string, unknown>)?.[heatmapConfig.activeKey])
      .filter((v): v is number => typeof v === 'number');
  }, [records, heatmapConfig]);

  const sortedRecords = useMemo(() => sortByZIndex(records), [records]);

  // Context menu state
  const [contextMenuTarget, setContextMenuTarget] = useState<FirecallItem>();
  const [contextMenuPos, setContextMenuPos] = useState<{
    top: number;
    left: number;
  }>();

  const handleContextMenu = useCallback(
    (item: FirecallItem, event: L.LeafletMouseEvent) => {
      setContextMenuTarget(item);
      setContextMenuPos({
        top: event.originalEvent.clientY,
        left: event.originalEvent.clientX,
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuTarget(undefined);
    setContextMenuPos(undefined);
  }, []);

  const editable = useMapEditable();
  const updateItem = useFirecallItemUpdate();

  const handleEdit = useCallback(
    (item: FirecallItem) => setFirecallItem(item),
    []
  );

  const handleDelete = useCallback(
    (item: FirecallItem) => updateItem({ ...item, deleted: true }),
    [updateItem]
  );

  return (
    <>
      {sortedRecords.map((record) => {
        let heatmapColor: string | undefined;
        if (heatmapConfig?.enabled && heatmapConfig?.activeKey) {
          const value = (record.fieldData as Record<string, unknown>)?.[heatmapConfig.activeKey];
          heatmapColor =
            typeof value === 'number'
              ? getHeatmapColor(value, heatmapConfig, allValues)
              : '#999999';
        }
        return (
          <React.Fragment key={record.id}>
            <>{renderMarker(record, setFirecallItem, {
              pane,
              onContextMenu: handleContextMenu,
              heatmapColor,
              dataSchema,
              layerShowLabels,
            })}</>
          </React.Fragment>
        );
      })}
      {firecallItem && (
        <ItemOverlay
          item={firecallItem}
          close={() => setFirecallItem(undefined)}
        />
      )}
      <ZOrderContextMenu
        item={contextMenuTarget}
        siblings={records}
        anchorPosition={contextMenuPos}
        onClose={closeContextMenu}
        onEdit={editable ? handleEdit : undefined}
        onDelete={editable ? handleDelete : undefined}
      />
    </>
  );
}
