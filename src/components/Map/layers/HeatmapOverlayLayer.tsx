'use client';

import { where } from 'firebase/firestore';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMap, Marker } from 'react-leaflet';
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
  getAlgorithm,
  idwAlgorithm,
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
  // Ref to the interpolation layer for direct value lookups on click.
  const interpLayerRef = useRef<any>(null);

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

  // Compute the surface maximum in metric space — stable across zoom levels.
  // Samples the algorithm at a 50×50 grid covering the data bounding box.
  const maxGridPoint = useMemo(() => {
    if (heatmapPoints.length === 0 || !heatmapConfig || heatmapConfig.visualizationMode !== 'interpolation') return null;

    const algoId = heatmapConfig.interpolationAlgorithm ?? 'idw';
    const algo = getAlgorithm(algoId) ?? idwAlgorithm;
    const logScale = !!heatmapConfig.interpolationLogScale;
    const safeLog = (v: number) => Math.log(Math.max(v, 1e-10));

    // Convert to metric space (same reference as idwPoints)
    const metricPoints: DataPoint[] = heatmapPoints.map((p) => {
      const m = latlngToMeters(p.lat, p.lng, refLat);
      return { x: m.x, y: m.y, value: logScale ? safeLog(p.value) : p.value };
    });

    const minPoints = algo.minPoints ?? 1;
    if (metricPoints.length < minPoints) return null;

    // Mirror param-merging logic from InterpolationOverlay._reset
    const savedParams = heatmapConfig.interpolationParams ?? {};
    const mergedParams: Record<string, number | boolean> = {};
    for (const desc of algo.params) {
      mergedParams[desc.key] = savedParams[desc.key] ?? desc.default;
    }
    if (algo.id === 'idw' && mergedParams.power === undefined && heatmapConfig.interpolationPower != null) {
      mergedParams.power = heatmapConfig.interpolationPower;
    }
    if (logScale) mergedParams._lambda = 0;
    // Metric space: 1 unit = 1 m; large search radius to include all points
    mergedParams._metersPerPixel = 1;
    const xs = metricPoints.map((p) => p.x);
    const ys = metricPoints.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    mergedParams._searchRadius = (Math.max(maxX - minX, maxY - minY) + 1) * 10;

    const state = algo.prepare(metricPoints, mergedParams);
    if (!state) return null;

    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);

    // Sample at 50×50 grid plus the exact measurement points
    const N = 50;
    const stepX = (maxX - minX) / Math.max(N - 1, 1);
    const stepY = (maxY - minY) / Math.max(N - 1, 1);

    let maxVal = -Infinity;
    let bestX = metricPoints[0].x;
    let bestY = metricPoints[0].y;

    // Allow algorithms (e.g. puff) to provide a peak candidate directly.
    if (algo.peakPoint) {
      const peak = algo.peakPoint(state);
      if (peak && isFinite(peak.value) && peak.value > maxVal) {
        maxVal = peak.value;
        bestX = peak.x;
        bestY = peak.y;
      }
    }

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = minX + i * stepX;
        const y = minY + j * stepY;
        const v = (algo as any).evaluate(x, y, state) as number;
        if (typeof v === 'number' && isFinite(v) && v > maxVal) {
          maxVal = v;
          bestX = x;
          bestY = y;
        }
      }
    }

    // Also evaluate at exact measurement points so we never miss a peak
    for (const pt of metricPoints) {
      const v = (algo as any).evaluate(pt.x, pt.y, state) as number;
      if (typeof v === 'number' && isFinite(v) && v > maxVal) {
        maxVal = v;
        bestX = pt.x;
        bestY = pt.y;
      }
    }

    if (!isFinite(maxVal)) return null;

    return { latlng: L.latLng(bestY / mPerDegLat, bestX / mPerDegLng), value: maxVal };
  }, [heatmapPoints, heatmapConfig, refLat]);

  // IDW data points in meter-space for click interpolation
  const idwPoints = useMemo(() => {
    if (heatmapPoints.length === 0) return [];
    return heatmapPoints.map((p) => {
      const m = latlngToMeters(p.lat, p.lng, refLat);
      return { x: m.x, y: m.y, value: p.value } as DataPoint;
    });
  }, [heatmapPoints, refLat]);

  const isInterpolation = heatmapConfig?.visualizationMode === 'interpolation';

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!fieldInfo || idwPoints.length === 0) return;

      // Remove existing popup
      if (popupRef.current) {
        map.closePopup(popupRef.current);
        popupRef.current = null;
      }

      let value: number | undefined;

      if (isInterpolation) {
        // Look up the exact value from the rendered interpolation grid.
        // This guarantees the popup matches the displayed colour.
        const layer = interpLayerRef.current;
        const gridVal = layer?.getValueAtLatLng?.(e.latlng) as number | null;
        if (gridVal == null) return; // click outside rendered area
        value = gridVal;
      } else {
        // Heatmap mode: check within radius and use IDW
        const clickM = latlngToMeters(e.latlng.lat, e.latlng.lng, refLat);
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
    [map, fieldInfo, idwPoints, refLat, heatmapConfig, isInterpolation],
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

  const maxMarkerIcon = useMemo(() => {
    if (!maxGridPoint || !fieldInfo) return null;
    const rounded = Math.round(maxGridPoint.value * 100) / 100;
    const label = `${rounded}${fieldInfo.unit ? '\u00a0' + fieldInfo.unit : ''}`;
    // Pin shape: rounded label badge → thin stem → triangle pointer
    const html = `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
      <div style="
        background:#b71c1c;
        color:#fff;
        font-weight:bold;
        font-size:12px;
        padding:4px 8px;
        border-radius:12px;
        white-space:nowrap;
        box-shadow:0 2px 4px rgba(0,0,0,0.45);
      ">${label}</div>
      <div style="width:2px;height:6px;background:#b71c1c;"></div>
      <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:9px solid #b71c1c;"></div>
    </div>`;
    const approxWidth = label.length * 7 + 16;
    // Total height: ~24px label + 6px stem + 9px triangle = 39px
    return L.divIcon({
      html,
      className: '',
      iconAnchor: [approxWidth / 2, 39],
      iconSize: [approxWidth, 39],
      popupAnchor: [0, -39],
    });
  }, [maxGridPoint, fieldInfo]);

  if (!heatmapConfig?.enabled || !heatmapConfig?.activeKey || heatmapPoints.length === 0) {
    return null;
  }

  return isInterpolation ? (
    <>
      <InterpolationOverlay
        points={heatmapPoints}
        config={heatmapConfig}
        allValues={allValues}
        layerRef={interpLayerRef}
      />
      {/* visible !== false: show marker when prop is omitted (undefined = default visible) */}
      {visible !== false && maxGridPoint && maxMarkerIcon && (
        <Marker
          position={[maxGridPoint.latlng.lat, maxGridPoint.latlng.lng]}
          icon={maxMarkerIcon}
          zIndexOffset={1000}
        />
      )}
    </>
  ) : (
    <HeatmapOverlay points={heatmapPoints} config={heatmapConfig} allValues={allValues} />
  );
}
