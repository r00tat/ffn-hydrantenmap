import { where } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
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
import HeatmapLegend from '../HeatmapLegend';
import { useHistoryPathSegments } from '../../../hooks/useMapEditor';
import HeatmapOverlay from './HeatmapOverlay';

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

  const heatmapConfig = layer?.heatmapConfig;
  const dataSchema = layer?.dataSchema;

  const allValues = useMemo(() => {
    if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
    return records
      .map((r) => (r.fieldData as Record<string, unknown>)?.[heatmapConfig.activeKey])
      .filter((v): v is number => typeof v === 'number');
  }, [records, heatmapConfig]);

  const heatmapPoints = useMemo(() => {
    if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
    return records
      .filter((r) => typeof r.fieldData?.[heatmapConfig.activeKey] === 'number' && r.lat && r.lng)
      .map((r) => ({
        lat: r.lat,
        lng: r.lng,
        value: r.fieldData![heatmapConfig.activeKey] as number,
      }));
  }, [records, heatmapConfig]);

  return (
    <>
      {records.map((record) => {
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
              heatmapColor,
              dataSchema,
            })}</>
          </React.Fragment>
        );
      })}
      {heatmapConfig?.enabled && heatmapConfig?.activeKey && heatmapPoints.length > 0 && (
        <HeatmapOverlay
          points={heatmapPoints}
          config={heatmapConfig}
          allValues={allValues}
        />
      )}
      {heatmapConfig?.enabled && heatmapConfig?.activeKey && dataSchema && (
        <HeatmapLegend
          config={heatmapConfig}
          dataSchema={dataSchema}
          allValues={allValues}
        />
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
