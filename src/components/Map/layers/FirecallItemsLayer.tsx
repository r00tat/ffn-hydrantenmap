import { where } from 'firebase/firestore';
import L from 'leaflet';
import React, { useCallback, useContext, useMemo, useState } from 'react';
import { getHeatmapColor } from '../../../common/heatmap';
import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import { FirecallContext, useFirecallId } from '../../../hooks/useFirecall';
import {
  filterDisplayableItems,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../../firebase/firestore';
import { getItemInstance } from '../../FirecallItems/elements';
import { FirecallVehicle } from '../../FirecallItems/elements/FirecallVehicle';
import { MarkerRenderOptions } from '../../FirecallItems/elements/marker/FirecallItemDefault';
import ItemOverlay from '../../FirecallItems/ItemOverlay';
import useMapEditor, { useHistoryPathSegments } from '../../../hooks/useMapEditor';
import useFirecallItemUpdate from '../../../hooks/useFirecallItemUpdate';
import copyAndSaveFirecallItems from '../../../hooks/copyLayer';
import { sortByZIndex, useFirecallLayers } from '../../../hooks/useFirecallLayers';
import ItemContextMenu from '../../FirecallItems/ItemContextMenu';

export interface FirecallLayerOptions {
  layer?: FirecallLayer;
  pane?: string;
}

function renderMarker(
  record: FirecallItem,
  setFirecallItem: (item: FirecallItem) => void,
  options?: MarkerRenderOptions,
  crewCountMap?: Map<string, number>
) {
  try {
    const instance = getItemInstance(record);
    if (record.type === 'vehicle' && crewCountMap && 'crewCount' in instance) {
      (instance as FirecallVehicle).crewCount = crewCountMap.get(record.id || '') ?? 0;
    }
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
  const { crewAssignments } = useContext(FirecallContext);
  const crewCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of crewAssignments) {
      if (c.vehicleId) {
        map.set(c.vehicleId, (map.get(c.vehicleId) || 0) + 1);
      }
    }
    return map;
  }, [crewAssignments]);
  const [firecallItem, setFirecallItem] = useState<FirecallItem>();
  const historyPathSegments = useHistoryPathSegments();
  const activeLayers = useFirecallLayers();
  const queryConstraints = useMemo(
    () => (layer?.id ? [where('layer', '==', layer.id)] : []),
    [layer]
  );
  const filterFn = useMemo(
    () =>
      layer?.id
        ? filterDisplayableItems
        : (e: FirecallItem) =>
            // Show items with no layer, or items whose layer no longer exists
            // (orphaned items from deleted layers)
            (e.layer === undefined ||
              e.layer === '' ||
              !(e.layer in activeLayers)) &&
            filterDisplayableItems(e),
    [layer?.id, activeLayers]
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

  const { editable, setEditable } = useMapEditor();
  const updateItem = useFirecallItemUpdate();

  const handleEdit = useCallback(
    (item: FirecallItem) => {
      if (!editable) setEditable(true);
      setFirecallItem(item);
    },
    [editable, setEditable]
  );

  const handleDelete = useCallback(
    (item: FirecallItem) => updateItem({ ...item, deleted: true }),
    [updateItem]
  );

  const handleCopy = useCallback(
    (item: FirecallItem) => copyAndSaveFirecallItems(firecallId, item),
    [firecallId]
  );

  const customActions = useMemo(() => {
    if (!contextMenuTarget) return undefined;
    return getItemInstance(contextMenuTarget).contextMenuItems(closeContextMenu);
  }, [contextMenuTarget, closeContextMenu]);

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
            }, crewCountMap)}</>
          </React.Fragment>
        );
      })}
      {firecallItem && (
        <ItemOverlay
          item={firecallItem}
          close={() => setFirecallItem(undefined)}
        />
      )}
      {contextMenuPos && (
        <ItemContextMenu
          item={contextMenuTarget}
          siblings={records}
          anchorPosition={contextMenuPos}
          onClose={closeContextMenu}
          onEdit={handleEdit}
          onDelete={editable ? handleDelete : undefined}
          onCopy={handleCopy}
          customActions={customActions}
        />
      )}
    </>
  );
}
