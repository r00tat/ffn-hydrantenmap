'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { HeatmapConfig } from '../../firebase/firestore';
import { normalizeValue } from '../../../common/heatmap';

/**
 * Convert a distance in meters to pixels at a specific zoom level and latitude.
 */
function metersToPixelsAtZoom(meters: number, lat: number, zoom: number): number {
  const metersPerPx =
    (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / metersPerPx;
}

/**
 * Build a leaflet.heat gradient object from config color stops.
 * Maps normalized intensity (0–1) to color strings.
 */
function buildGradient(config: HeatmapConfig): Record<number, string> {
  if (
    config.colorMode === 'manual' &&
    config.colorStops?.length &&
    config.colorStops.length >= 2
  ) {
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
  if (config.invertAutoColor) {
    return { 0: '#ff0000', 0.5: '#ffff00', 1: '#00ff00' };
  }
  return { 0: '#00ff00', 0.5: '#ffff00', 1: '#ff0000' };
}

// ---------------------------------------------------------------------------
// Custom heatmap L.Layer that uses simpleheat directly.
// Unlike leaflet.heat's built-in layer, we size the canvas to include
// padding equal to the full circle radius so circles near the viewport
// edges are never clipped by the canvas boundary.
// ---------------------------------------------------------------------------

interface SimpleHeatInstance {
  data(d: number[][]): SimpleHeatInstance;
  max(v: number): SimpleHeatInstance;
  radius(r: number, blur?: number): SimpleHeatInstance;
  gradient(g: Record<number, string>): SimpleHeatInstance;
  draw(minOpacity?: number): SimpleHeatInstance;
  _r: number;
  _max: number;
  _data: number[][];
  _width: number;
  _height: number;
  _canvas: HTMLCanvasElement;
  _ctx: CanvasRenderingContext2D;
}

type SimpleHeatFactory = (canvas: HTMLCanvasElement) => SimpleHeatInstance;

const CustomHeatLayer = L.Layer.extend({
  options: {
    radiusMeters: 30,
    blurFraction: 0.6,
    maxVal: 1,
    gradient: { 0: '#00ff00', 0.5: '#ffff00', 1: '#ff0000' } as Record<
      number,
      string
    >,
    minOpacity: 0.05,
  },

  initialize(
    this: {
      _latlngs: [number, number, number][];
      _centerLat: number;
    } & L.Layer,
    latlngs: [number, number, number][],
    centerLat: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
  ) {
    this._latlngs = latlngs;
    this._centerLat = centerLat;
    L.setOptions(this, options);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAdd(this: any, map: L.Map) {
    this._map = map;

    // Create canvas element
    const canvas = (this._canvas = L.DomUtil.create(
      'canvas',
      'leaflet-heatmap-layer leaflet-layer leaflet-zoom-hide',
    ) as HTMLCanvasElement);
    const originProp = L.DomUtil.testProp([
      'transformOrigin',
      'WebkitTransformOrigin',
      'msTransformOrigin',
    ]);
    if (originProp) canvas.style[originProp as any] = '50% 50%';

    map.getPanes().overlayPane.appendChild(canvas);
    map.on('moveend', this._reset, this);
    this._reset();
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRemove(this: any, map: L.Map) {
    map.getPanes().overlayPane.removeChild(this._canvas);
    map.off('moveend', this._reset, this);
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _reset(this: any) {
    if (!this._map) return;

    const simpleheat = (window as unknown as { simpleheat: SimpleHeatFactory })
      .simpleheat;
    const map: L.Map = this._map;
    const zoom = map.getZoom();
    const size = map.getSize();

    // Compute pixel radius for the current zoom level
    const radiusPx = Math.max(
      5,
      Math.round(
        metersToPixelsAtZoom(this.options.radiusMeters, this._centerLat, zoom),
      ),
    );
    const blurPx = Math.max(
      1,
      Math.round(radiusPx * this.options.blurFraction),
    );
    const pad = radiusPx + blurPx; // same as simpleheat's _r

    // Size canvas to viewport + padding on each side
    const canvasW = size.x + 2 * pad;
    const canvasH = size.y + 2 * pad;

    const canvas: HTMLCanvasElement = this._canvas;
    canvas.width = canvasW;
    canvas.height = canvasH;

    // Position canvas so (0,0) of the bitmap = container (-pad, -pad)
    const topLeft = map.containerPointToLayerPoint(L.point(-pad, -pad));
    L.DomUtil.setPosition(canvas, topLeft);

    // Build data array with padded container coordinates
    const data: number[][] = [];
    for (let i = 0; i < this._latlngs.length; i++) {
      const ll = this._latlngs[i];
      const p = map.latLngToContainerPoint(L.latLng(ll[0], ll[1]));
      // Offset by pad so coordinates are relative to the padded canvas origin
      data.push([Math.round(p.x + pad), Math.round(p.y + pad), ll[2]]);
    }

    // Create a fresh simpleheat instance on our correctly-sized canvas
    const heat: SimpleHeatInstance = simpleheat(canvas);
    heat.radius(radiusPx, blurPx);
    heat.max(this.options.maxVal);
    heat.gradient(this.options.gradient);
    heat.data(data).draw(this.options.minOpacity);

    // DEBUG: draw circle outlines and canvas boundary
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Red border around the full canvas
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, canvasW - 2, canvasH - 2);
      // Blue border around the viewport area within the canvas
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 2;
      ctx.strokeRect(pad, pad, size.x, size.y);
      // Green circle outlines at each data point
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 2;
      for (let j = 0; j < data.length; j++) {
        ctx.beginPath();
        ctx.arc(data[j][0], data[j][1], radiusPx, 0, 2 * Math.PI);
        ctx.stroke();
        // Cross at center
        ctx.beginPath();
        ctx.moveTo(data[j][0] - 10, data[j][1]);
        ctx.lineTo(data[j][0] + 10, data[j][1]);
        ctx.moveTo(data[j][0], data[j][1] - 10);
        ctx.lineTo(data[j][0], data[j][1] + 10);
        ctx.stroke();
      }
      console.log('[heatmap] DEBUG: canvas=' + canvasW + 'x' + canvasH +
        ' pad=' + pad + ' radiusPx=' + radiusPx + ' blurPx=' + blurPx +
        ' viewport=' + size.x + 'x' + size.y + ' points=' + data.length +
        ' zoom=' + zoom);
      for (let j = 0; j < data.length; j++) {
        console.log('[heatmap]   point ' + j + ': canvas=(' + data[j][0] + ',' + data[j][1] + ') intensity=' + data[j][2]);
      }
    }
  },
});

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
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (points.length === 0) return;

    // leaflet.heat's side-effect registers window.simpleheat
    let cancelled = false;
    import('leaflet.heat').then(() => {
      if (cancelled) return;

      const data = points.map(
        (p) =>
          [p.lat, p.lng, normalizeValue(p.value, config, allValues)] as [
            number,
            number,
            number,
          ],
      );

      const centerLat =
        points.reduce((sum, p) => sum + p.lat, 0) / points.length;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = new (CustomHeatLayer as any)(data, centerLat, {
        radiusMeters: config.radius ?? 30,
        blurFraction: (config.blur ?? 15) / 25,
        maxVal: 1,
        gradient: buildGradient(config),
      }) as L.Layer;

      layer.addTo(map);
      layerRef.current = layer;
    });

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
