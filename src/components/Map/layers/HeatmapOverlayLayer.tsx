'use client';

import { where } from 'firebase/firestore';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
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
import {
  computeConvexHull,
  distanceToPolygonEdge,
  idwInterpolate,
  DataPoint,
  pointInPolygon,
} from '../../../common/interpolation';
import HeatmapOverlay from './HeatmapOverlay';
import InterpolationOverlay from './InterpolationOverlay';

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

/**
 * Approximate meters per degree at a given latitude.
 * Used to normalize lat/lng into roughly equal-scale coordinates for IDW.
 */
function latlngToMeters(lat: number, lng: number, refLat: number): { x: number; y: number } {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);
  return { x: lng * mPerDegLng, y: lat * mPerDegLat };
}

interface HeatmapOverlayLayerProps {
  layer: FirecallLayer;
  visible?: boolean;
}

export default function HeatmapOverlayLayer({ layer, visible }: HeatmapOverlayLayerProps) {
  const firecallId = useFirecallId();
  const map = useMap();
  const historyPathSegments = useHistoryPathSegments();
  const heatmapConfig = layer.heatmapConfig;
  const popupRef = useRef<L.Popup | null>(null);

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

  // Field info for popup display
  const fieldInfo = useMemo(() => {
    if (!heatmapConfig?.activeKey || !layer.dataSchema) return null;
    const field = layer.dataSchema.find((f) => f.key === heatmapConfig.activeKey);
    if (!field) return null;
    return { label: field.label, unit: field.unit || '' };
  }, [heatmapConfig, layer.dataSchema]);

  const refLat = useMemo(
    () => heatmapPoints.length > 0
      ? heatmapPoints.reduce((s, p) => s + p.lat, 0) / heatmapPoints.length
      : 0,
    [heatmapPoints],
  );

  // IDW data points in meter-space for click interpolation
  const idwPoints = useMemo(() => {
    if (heatmapPoints.length === 0) return [];
    return heatmapPoints.map((p) => {
      const m = latlngToMeters(p.lat, p.lng, refLat);
      return { x: m.x, y: m.y, value: p.value } as DataPoint;
    });
  }, [heatmapPoints, refLat]);

  // Convex hull in meter-space for boundary check
  const hull = useMemo(() => computeConvexHull(idwPoints), [idwPoints]);

  const isInterpolation = heatmapConfig?.visualizationMode === 'interpolation';

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!fieldInfo || idwPoints.length === 0) return;

      // Remove existing popup
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }

      const clickM = latlngToMeters(e.latlng.lat, e.latlng.lng, refLat);

      // Check if click is within the colored area and compute boundary decay
      let valueFade = 1.0;
      if (isInterpolation) {
        // Interpolation: convex hull + buffer radius
        const bufferM = heatmapConfig?.interpolationRadius ?? 30;
        if (hull.length >= 3) {
          const inside = pointInPolygon(clickM.x, clickM.y, hull);
          if (!inside) {
            const edgeDist = distanceToPolygonEdge(clickM.x, clickM.y, hull);
            if (edgeDist > bufferM) return;
            // Linear value decay in buffer zone
            valueFade = 1 - edgeDist / bufferM;
          }
        } else {
          // Degenerate hull (1-2 points): check distance to nearest point
          let minDist = Infinity;
          for (const p of idwPoints) {
            const dx = clickM.x - p.x;
            const dy = clickM.y - p.y;
            minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
          }
          const radius = heatmapConfig?.interpolationRadius ?? 30;
          if (minDist > radius) return;
          // Linear value decay based on distance
          valueFade = 1 - minDist / radius;
        }
      } else {
        // Heatmap: within radius of any data point
        const radiusM = heatmapConfig?.radius ?? 30;
        let withinRadius = false;
        for (const p of idwPoints) {
          const dx = clickM.x - p.x;
          const dy = clickM.y - p.y;
          if (Math.sqrt(dx * dx + dy * dy) <= radiusM) {
            withinRadius = true;
            break;
          }
        }
        if (!withinRadius) return;
      }

      const power = heatmapConfig?.interpolationPower ?? 2;
      const value = idwInterpolate(clickM.x, clickM.y, idwPoints, power) * valueFade;
      const rounded = Math.round(value * 100) / 100;

      const popup = L.popup({ closeOnClick: true })
        .setLatLng(e.latlng)
        .setContent(
          `<b>${fieldInfo.label}</b><br/>${rounded}${fieldInfo.unit ? ' ' + fieldInfo.unit : ''}`
        )
        .openOn(map);

      popupRef.current = popup;
    },
    [map, fieldInfo, idwPoints, hull, refLat, heatmapConfig, isInterpolation],
  );

  // Attach/detach click handler based on visibility
  useEffect(() => {
    if (!visible) {
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }
      return;
    }

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }
    };
  }, [map, visible, handleMapClick]);

  if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey || heatmapPoints.length === 0) {
    return null;
  }

  return isInterpolation ? (
    <InterpolationOverlay points={heatmapPoints} config={heatmapConfig} allValues={allValues} />
  ) : (
    <HeatmapOverlay points={heatmapPoints} config={heatmapConfig} allValues={allValues} />
  );
}
