'use client';

import { where } from 'firebase/firestore';
import { useMemo } from 'react';
import useFirebaseCollection from '../../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../../hooks/useFirecall';
import {
  filterDisplayableItems,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../../firebase/firestore';
import { useHistoryPathSegments } from '../../../hooks/useMapEditor';
import HeatmapLegend from '../HeatmapLegend';
import HeatmapOverlay from './HeatmapOverlay';

/** Extract a numeric value from fieldData, coercing strings if needed */
function getNumericValue(fieldData: Record<string, unknown> | undefined, key: string): number | undefined {
  const raw = fieldData?.[key];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw !== '') {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

interface HeatmapOverlayLayerProps {
  layer: FirecallLayer;
}

export default function HeatmapOverlayLayer({ layer }: HeatmapOverlayLayerProps) {
  const firecallId = useFirecallId();
  const historyPathSegments = useHistoryPathSegments();
  const heatmapConfig = layer.heatmapConfig;

  const queryConstraints = useMemo(
    () => (layer.id ? [where('layer', '==', layer.id)] : []),
    [layer]
  );

  const records = useFirebaseCollection<FirecallItem>({
    collectionName: FIRECALL_COLLECTION_ID,
    queryConstraints,
    pathSegments: [
      firecallId,
      ...historyPathSegments,
      FIRECALL_ITEMS_COLLECTION_ID,
    ],
    filterFn: filterDisplayableItems,
  });

  const allValues = useMemo(() => {
    if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
    return records
      .map((r) => getNumericValue(r.fieldData as Record<string, unknown>, heatmapConfig.activeKey))
      .filter((v): v is number => v !== undefined);
  }, [records, heatmapConfig]);

  const heatmapPoints = useMemo(() => {
    if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
    const points: { lat: number; lng: number; value: number }[] = [];
    for (const r of records) {
      const value = getNumericValue(r.fieldData as Record<string, unknown>, heatmapConfig.activeKey);
      if (value !== undefined && r.lat != null && r.lng != null) {
        points.push({ lat: r.lat, lng: r.lng, value });
      }
    }
    return points;
  }, [records, heatmapConfig]);

  console.log('HeatmapOverlayLayer', {
    layerId: layer.id,
    layerName: layer.name,
    recordCount: records.length,
    allValuesCount: allValues.length,
    heatmapPointsCount: heatmapPoints.length,
    heatmapPoints,
    sampleFieldData: records.slice(0, 3).map((r) => ({ name: r.name, fieldData: r.fieldData })),
  });

  if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey || heatmapPoints.length === 0) {
    return null;
  }

  return (
    <>
      <HeatmapOverlay
        points={heatmapPoints}
        config={heatmapConfig}
        allValues={allValues}
      />
      {layer.dataSchema && (
        <HeatmapLegend
          config={heatmapConfig}
          dataSchema={layer.dataSchema}
          allValues={allValues}
          layerName={layer.name}
        />
      )}
    </>
  );
}
