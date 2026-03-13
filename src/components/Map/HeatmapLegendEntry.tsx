'use client';

import { where } from 'firebase/firestore';
import { useMemo } from 'react';
import useFirebaseCollection from '../../hooks/useFirebaseCollection';
import { useFirecallId } from '../../hooks/useFirecall';
import {
  filterDisplayableItems,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../firebase/firestore';
import { useHistoryPathSegments } from '../../hooks/useMapEditor';
import HeatmapLegend from './HeatmapLegend';

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

interface HeatmapLegendEntryProps {
  layer: FirecallLayer;
}

export default function HeatmapLegendEntry({ layer }: HeatmapLegendEntryProps) {
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

  if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey || !layer.dataSchema) {
    return null;
  }

  return (
    <HeatmapLegend
      config={heatmapConfig}
      dataSchema={layer.dataSchema}
      allValues={allValues}
      layerName={layer.name}
    />
  );
}
