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

    // Dynamic import to avoid SSR issues
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import('leaflet.heat') as Promise<any>).then((mod) => {
      if (cancelled) return;
      const heatLayer = typeof mod === 'function' ? mod : mod.default;

      const data = points.map((p) => [
        p.lat,
        p.lng,
        normalizeValue(p.value, config, allValues),
      ] as [number, number, number]);

      const layer = heatLayer(data, {
        radius: 25,
        blur: 15,
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
