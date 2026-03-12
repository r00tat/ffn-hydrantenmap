'use client';

import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { HeatmapConfig } from '../../firebase/firestore';
import { normalizeValue } from '../../../common/heatmap';

/**
 * Convert a distance in meters to pixels at the current map zoom and latitude.
 */
function metersToPixels(map: L.Map, meters: number, lat: number): number {
  const zoom = map.getZoom();
  const point = map.project(L.latLng(lat, 0), zoom);
  const pointPlusMeters = map.project(
    L.latLng(lat, 0).toBounds(meters * 2).getNorthEast(),
    zoom
  );
  return Math.abs(pointPlusMeters.x - point.x);
}

/**
 * Build a leaflet.heat gradient object from config color stops.
 * Maps normalized intensity (0–1) to color strings.
 */
function buildGradient(config: HeatmapConfig): Record<number, string> {
  if (config.colorMode === 'manual' && config.colorStops?.length && config.colorStops.length >= 2) {
    const sorted = [...config.colorStops].sort((a, b) => a.value - b.value);
    const min = sorted[0].value;
    const max = sorted[sorted.length - 1].value;
    const range = max - min || 1;
    const gradient: Record<number, string> = {};
    for (const stop of sorted) {
      const t = (stop.value - min) / range;
      gradient[t] = stop.color;
    }
    return gradient;
  }
  // Auto mode: use the same green→yellow→red (or inverted)
  if (config.invertAutoColor) {
    return { 0: '#ff0000', 0.5: '#ffff00', 1: '#00ff00' };
  }
  return { 0: '#00ff00', 0.5: '#ffff00', 1: '#ff0000' };
}

interface HeatmapOverlayProps {
  points: { lat: number; lng: number; value: number }[];
  config: HeatmapConfig;
  allValues: number[];
}

export default function HeatmapOverlay({
  points,
  config,
  allValues,
}: HeatmapOverlayProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  const [zoom, setZoom] = useState(map.getZoom());

  // Track zoom changes to recalculate pixel radius
  const onZoom = useCallback(() => setZoom(map.getZoom()), [map]);
  useEffect(() => {
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [map, onZoom]);

  useEffect(() => {
    // Clean up previous layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    // Dynamic import — leaflet.heat is a side-effect plugin that patches L.heatLayer
    let cancelled = false;
    import('leaflet.heat').then(() => {
      if (cancelled) return;

      const data = points.map((p) => [
        p.lat,
        p.lng,
        normalizeValue(p.value, config, allValues),
      ] as [number, number, number]);

      // Convert meter-based radius to pixels at the center latitude
      const centerLat = points.length > 0
        ? points.reduce((sum, p) => sum + p.lat, 0) / points.length
        : map.getCenter().lat;
      const radiusMeters = config.radius ?? 100;
      const radiusPx = Math.max(5, Math.round(metersToPixels(map, radiusMeters, centerLat)));
      const blurPx = Math.max(1, Math.round(radiusPx * ((config.blur ?? 15) / 25)));

      // leaflet.heat patches L with heatLayer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = (L as any).heatLayer(data, {
        radius: radiusPx,
        blur: blurPx,
        maxZoom: 17,
        max: 1,
        gradient: buildGradient(config),
      }) as L.Layer;

      layer.addTo(map);
      layerRef.current = layer;
    });

    // Cleanup
    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, config, allValues, zoom]);

  return null;
}
