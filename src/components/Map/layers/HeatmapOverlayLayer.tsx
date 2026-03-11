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
import HeatmapOverlay from './HeatmapOverlay';

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
      .map((r) => (r.fieldData as Record<string, unknown>)?.[heatmapConfig.activeKey])
      .filter((v): v is number => typeof v === 'number');
  }, [records, heatmapConfig]);

  const heatmapPoints = useMemo(() => {
    if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey) return [];
    return records
      .filter((r): r is typeof r & { lat: number; lng: number } =>
        typeof r.fieldData?.[heatmapConfig.activeKey] === 'number' && r.lat != null && r.lng != null)
      .map((r) => ({
        lat: r.lat,
        lng: r.lng,
        value: r.fieldData![heatmapConfig.activeKey] as number,
      }));
  }, [records, heatmapConfig]);

  if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey || heatmapPoints.length === 0) {
    return null;
  }

  return (
    <HeatmapOverlay
      points={heatmapPoints}
      config={heatmapConfig}
      allValues={allValues}
    />
  );
}
