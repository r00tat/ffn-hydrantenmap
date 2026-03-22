'use client';

import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const SCREEN_DPI = 96;
const INCHES_PER_METER = 39.3701;

function calculateScaleRatio(map: L.Map): number {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const metersPerPixel =
    (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) /
    Math.pow(2, zoom + 8);
  const pixelsPerMeter = SCREEN_DPI * INCHES_PER_METER;
  return Math.round(pixelsPerMeter * metersPerPixel);
}

function formatRatio(ratio: number): string {
  const nice = [
    100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 15000, 20000, 25000,
    50000, 100000, 200000, 250000, 500000, 1000000,
  ];
  const closest = nice.reduce((prev, curr) =>
    Math.abs(curr - ratio) < Math.abs(prev - ratio) ? curr : prev,
  );
  return `1:${closest.toLocaleString('de-DE')}`;
}

const ScaleRatioControl = L.Control.extend({
  options: {
    position: 'bottomright' as L.ControlPosition,
  },

  onAdd(map: L.Map) {
    const container = L.DomUtil.create('div', 'leaflet-scale-ratio');
    container.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    container.style.padding = '0 4px';
    container.style.fontSize = '11px';
    container.style.lineHeight = '16px';
    container.style.color = '#333';
    container.style.pointerEvents = 'none';
    container.style.marginBottom = '2px';

    const update = () => {
      container.textContent = formatRatio(calculateScaleRatio(map));
    };

    map.on('zoomend moveend', update);
    update();

    (this as any)._container = container;
    (this as any)._update = update;
    return container;
  },

  onRemove(map: L.Map) {
    map.off('zoomend moveend', (this as any)._update);
  },
});

export default function ScaleRatioControlComponent() {
  const map = useMap();

  useEffect(() => {
    const control = new ScaleRatioControl();
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);

  return null;
}
