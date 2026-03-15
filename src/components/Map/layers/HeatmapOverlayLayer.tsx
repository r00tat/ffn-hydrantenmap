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
  idwInterpolate,
  computeConvexHull,
  pointInPolygon,
  solveTPS,
  evaluateTPS,
  DataPoint,
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

  const isInterpolation = heatmapConfig?.visualizationMode === 'interpolation';

  // Convex hull and TPS weights for click interpolation (meter-space)
  const clickHull = useMemo(
    () => idwPoints.length >= 3 ? computeConvexHull(idwPoints) : [],
    [idwPoints],
  );
  const algo = (heatmapConfig?.interpolationAlgorithm ?? 'idw') as 'idw' | 'spline';
  const clickTps = useMemo(
    () => algo === 'spline' && idwPoints.length >= 3 ? solveTPS(idwPoints) : null,
    [idwPoints, algo],
  );

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!fieldInfo || idwPoints.length === 0) return;

      // Remove existing popup
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }

      const clickM = latlngToMeters(e.latlng.lat, e.latlng.lng, refLat);

      // Check if click is within the colored area
      if (isInterpolation) {
        // Point-proximity boundary: only respond within bufferM of a data point
        const bufferM = heatmapConfig?.interpolationRadius ?? 30;
        let nearestDist = Infinity;
        for (const p of idwPoints) {
          const dx = clickM.x - p.x;
          const dy = clickM.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nearestDist) nearestDist = d;
        }
        if (nearestDist > bufferM) return;
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

      // Outside the hull, fade value toward data minimum with distance
      // (same logic as buildInterpolationGrid).
      const insideHull = clickHull.length >= 3 && pointInPolygon(clickM.x, clickM.y, clickHull);
      const bufferM = heatmapConfig?.interpolationRadius ?? 30;
      let value: number;
      if (!insideHull) {
        // Nearest data point value, faded toward data min by distance
        let nearestDistSq = Infinity;
        let nearestVal = 0;
        let dataMin = Infinity;
        for (const p of idwPoints) {
          const dx = clickM.x - p.x;
          const dy = clickM.y - p.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            nearestVal = p.value;
          }
          if (p.value < dataMin) dataMin = p.value;
        }
        const nearestDist = Math.sqrt(nearestDistSq);
        const fade = 1 - nearestDist / bufferM;
        value = dataMin + fade * (nearestVal - dataMin);
      } else if (algo === 'spline' && clickTps) {
        value = evaluateTPS(clickM.x, clickM.y, clickTps);
      } else {
        const power = heatmapConfig?.interpolationPower ?? 2;
        value = idwInterpolate(clickM.x, clickM.y, idwPoints, power);
      }
      const rounded = Math.round(value * 100) / 100;

      const popup = L.popup({ closeOnClick: true })
        .setLatLng(e.latlng)
        .setContent(
          `<b>${fieldInfo.label}</b><br/>${rounded}${fieldInfo.unit ? ' ' + fieldInfo.unit : ''}`
        )
        .openOn(map);

      popupRef.current = popup;
    },
    [map, fieldInfo, idwPoints, refLat, heatmapConfig, isInterpolation, clickHull, clickTps, algo],
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
