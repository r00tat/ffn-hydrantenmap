'use client';

import { useLeafletContext } from '@react-leaflet/core';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { HeatmapConfig } from '../../firebase/firestore';
import {
  buildColorLUT,
  buildInterpolationGrid,
  computeConvexHull,
  DataPoint,
  solveTPS,
  TpsWeights,
} from '../../../common/interpolation';

/**
 * Convert a distance in meters to pixels at a specific zoom level and latitude.
 */
function metersToPixelsAtZoom(meters: number, lat: number, zoom: number): number {
  const metersPerPx =
    (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
  return meters / metersPerPx;
}

const InterpolationCanvasLayer = L.Layer.extend({
  options: {
    radiusMeters: 30,
    power: 2,
    opacity: 0.6,
  },

  initialize(
    this: {
      _points: DataPoint[];
      _latlngs: { lat: number; lng: number; value: number }[];
      _centerLat: number;
      _colorLUT: Uint8Array;
      _config: HeatmapConfig;
      _allValues: number[];
      _tpsWeights: TpsWeights | null;
    } & L.Layer,
    latlngs: { lat: number; lng: number; value: number }[],
    centerLat: number,
    colorLUT: Uint8Array,
    config: HeatmapConfig,
    allValues: number[],
    options: unknown,
  ) {
    this._latlngs = latlngs;
    this._centerLat = centerLat;
    this._colorLUT = colorLUT;
    this._config = config;
    this._allValues = allValues;
    this._tpsWeights = null;
    L.setOptions(this, options);
  },

  onAdd(this: any, map: L.Map) {
    this._map = map;

    const canvas = (this._canvas = L.DomUtil.create(
      'canvas',
      'leaflet-interpolation-layer leaflet-layer leaflet-zoom-hide',
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

  onRemove(this: any, map: L.Map) {
    map.getPanes().overlayPane.removeChild(this._canvas);
    map.off('moveend', this._reset, this);
  },

  _reset(this: any) {
    if (!this._map) return;

    const map: L.Map = this._map;
    const zoom = map.getZoom();
    const size = map.getSize();

    // Compute pixel buffer from radiusMeters
    const bufferPx = Math.max(
      5,
      Math.round(
        metersToPixelsAtZoom(this.options.radiusMeters, this._centerLat, zoom),
      ),
    );

    // Size canvas to viewport + padding so interpolation at edges isn't clipped
    const canvasW = size.x + 2 * bufferPx;
    const canvasH = size.y + 2 * bufferPx;

    const canvas: HTMLCanvasElement = this._canvas;
    canvas.width = canvasW;
    canvas.height = canvasH;

    // Position canvas so (0,0) of the bitmap = container (-bufferPx, -bufferPx)
    const topLeft = map.containerPointToLayerPoint(L.point(-bufferPx, -bufferPx));
    L.DomUtil.setPosition(canvas, topLeft);

    // Convert lat/lng to pixel coordinates (offset by bufferPx)
    const pixelPoints: DataPoint[] = [];
    for (let i = 0; i < this._latlngs.length; i++) {
      const ll = this._latlngs[i];
      const p = map.latLngToContainerPoint(L.latLng(ll.lat, ll.lng));
      pixelPoints.push({ x: Math.round(p.x + bufferPx), y: Math.round(p.y + bufferPx), value: ll.value });
    }

    this._points = pixelPoints;

    const algo = (this._config.interpolationAlgorithm ?? 'idw') as 'idw' | 'spline';
    this._tpsWeights =
      algo === 'spline' && this._points.length >= 3 ? solveTPS(this._points) : null;

    // Compute convex hull for interior filling
    const hull = computeConvexHull(pixelPoints);

    // Build interpolation grid and paint
    const imageData = buildInterpolationGrid({
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      points: pixelPoints,
      hull,
      bufferPx,
      power: this.options.power,
      opacity: this.options.opacity,
      colorLUT: this._colorLUT,
      config: this._config,
      allValues: this._allValues,
      algorithm: (this._config.interpolationAlgorithm ?? 'idw') as 'idw' | 'spline',
      tpsWeights: this._tpsWeights ?? undefined,
    });

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
  },
});

interface InterpolationOverlayProps {
  points: { lat: number; lng: number; value: number }[];
  config: HeatmapConfig;
  allValues: number[];
}

export default function InterpolationOverlay({
  points,
  config,
  allValues,
}: InterpolationOverlayProps) {
  const context = useLeafletContext();
  const container = context.layerContainer || context.map;
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      container.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (points.length === 0) return;

    const centerLat =
      points.reduce((sum, p) => sum + p.lat, 0) / points.length;

    const opacity = config.interpolationOpacity ?? 0.6;
    const colorLUT = buildColorLUT(config, opacity);

    const layer = new (InterpolationCanvasLayer as any)(
      points,
      centerLat,
      colorLUT,
      config,
      allValues,
      {
        radiusMeters: config.interpolationRadius ?? 30,
        power: config.interpolationPower ?? 2,
        opacity,
      },
    ) as L.Layer;

    container.addLayer(layer);
    layerRef.current = layer;

    return () => {
      if (layerRef.current) {
        container.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [container, points, config, allValues]);

  return null;
}
