'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { HeatmapConfig } from '../../firebase/firestore';
import { normalizeValue } from '../../../common/heatmap';

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
