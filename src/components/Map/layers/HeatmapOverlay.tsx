'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { HeatmapConfig } from '../../firebase/firestore';
import { normalizeValue } from '../../../common/heatmap';

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

      // leaflet.heat patches L with heatLayer
      const layer = (L as Record<string, unknown>).heatLayer(data, {
        radius: config.radius ?? 25,
        blur: config.blur ?? 15,
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
  }, [map, points, config, allValues]);

  return null;
}
