'use client';

import { useLeafletContext } from '@react-leaflet/core';
import L from 'leaflet';
import { MutableRefObject, useEffect, useRef } from 'react';
import { HeatmapConfig } from '../../firebase/firestore';
import {
  buildColorLUT,
  buildInterpolationGrid,
  computeConvexHull,
  DataPoint,
  getAlgorithm,
  idwAlgorithm,
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
      _valueGrid: Float32Array | null;
      _gridCols: number;
      _blockSize: number;
      _bufferPx: number;
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
    this._valueGrid = null;
    this._gridCols = 0;
    this._blockSize = 4;
    this._bufferPx = 0;
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

    const algoId = this._config.interpolationAlgorithm ?? 'idw';
    const algo = getAlgorithm(algoId) ?? idwAlgorithm;

    const logScale = !!this._config.interpolationLogScale;
    const safeLog = (v: number) => Math.log(Math.max(v, 1e-10));
    const interpPoints = logScale
      ? pixelPoints.map((p: DataPoint) => ({ x: p.x, y: p.y, value: safeLog(p.value) }))
      : pixelPoints;

    // Merge saved params with algorithm defaults
    const savedParams = this._config.interpolationParams ?? {};
    const mergedParams: Record<string, number | boolean> = {};
    for (const desc of algo.params) {
      mergedParams[desc.key] = savedParams[desc.key] ?? desc.default;
    }
    // Migration: if interpolationPower exists but not in interpolationParams, use it
    if (algo.id === 'idw' && mergedParams.power === undefined && this._config.interpolationPower != null) {
      mergedParams.power = this._config.interpolationPower;
    }
    // Pass search radius hint for IDW optimization
    mergedParams._searchRadius = bufferPx * 5;
    // Pass lambda hint for TPS log-scale mode
    if (logScale) mergedParams._lambda = 0;
    // Pass real-world scale for algorithms that need metric distances (e.g. STE Gaussian Plume)
    {
      const p0 = map.containerPointToLatLng(L.point(0, 0));
      const p1 = map.containerPointToLatLng(L.point(1, 0));
      mergedParams._metersPerPixel = p0.distanceTo(p1);
    }

    // Debug: log interpolation input for diagnostics
    console.log(JSON.stringify({
      algorithm: algoId,
      logScale,
      zoom,
      metersPerPixel: mergedParams._metersPerPixel,
      params: mergedParams,
      latlngs: this._latlngs.map((ll: any) => ({ lat: ll.lat, lng: ll.lng, value: ll.value })),
      pixelPoints,
      interpPoints,
    }));

    const minPoints = algo.minPoints ?? 1;
    const preparedState = interpPoints.length >= minPoints
      ? algo.prepare(interpPoints, mergedParams)
      : null;

    // Build interpolation grid and paint
    const blockSize = 4;

    if (preparedState === null) {
      // Not enough points for this algorithm — clear canvas and bail out.
      this._valueGrid = null;
      this._gridCols = 0;
      this._blockSize = blockSize;
      this._bufferPx = bufferPx;
      const ctx2 = canvas.getContext('2d');
      if (ctx2) ctx2.clearRect(0, 0, canvasW, canvasH);
      this.options.onMaxPoint?.(null);
      return;
    }

    // Compute convex hull for interior filling
    const hull = computeConvexHull(pixelPoints);
    const { imageData, valueGrid, gridCols } = buildInterpolationGrid({
      canvasWidth: canvasW,
      canvasHeight: canvasH,
      points: pixelPoints,
      hull,
      bufferPx,
      opacity: this.options.opacity,
      colorLUT: this._colorLUT,
      config: this._config,
      allValues: this._allValues,
      blockSize,
      algorithm: algo,
      state: preparedState,
    });

    this._valueGrid = valueGrid;
    this._gridCols = gridCols;
    this._blockSize = blockSize;
    this._bufferPx = bufferPx;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }

    // Report the grid-space maximum back to the caller so they can place a marker.
    if (this.options.onMaxPoint) {
      let maxVal = -Infinity;
      let maxIdx = -1;
      for (let i = 0; i < valueGrid.length; i++) {
        const v = valueGrid[i];
        if (!isNaN(v) && v > maxVal) {
          maxVal = v;
          maxIdx = i;
        }
      }
      if (maxIdx >= 0) {
        const gx = maxIdx % gridCols;
        const gy = Math.floor(maxIdx / gridCols);
        // Convert grid cell centre back to container coordinates (subtract bufferPx offset)
        const cx = gx * blockSize + blockSize / 2 - bufferPx;
        const cy = gy * blockSize + blockSize / 2 - bufferPx;
        const latlng = map.containerPointToLatLng(L.point(cx, cy));
        this.options.onMaxPoint({ latlng, value: maxVal });
      } else {
        this.options.onMaxPoint(null);
      }
    }
  },

  /** Look up the rendered interpolated value at a given lat/lng.
   *  Returns the exact value used for colouring, or null if outside the rendered area. */
  getValueAtLatLng(this: any, latlng: L.LatLng): number | null {
    if (!this._map || !this._valueGrid) return null;
    const p = this._map.latLngToContainerPoint(latlng);
    const px = Math.round(p.x + this._bufferPx);
    const py = Math.round(p.y + this._bufferPx);
    const gx = Math.floor(px / this._blockSize);
    const gy = Math.floor(py / this._blockSize);
    if (gx < 0 || gy < 0 || gx >= this._gridCols) return null;
    const idx = gy * this._gridCols + gx;
    if (idx < 0 || idx >= this._valueGrid.length) return null;
    const v = this._valueGrid[idx];
    return isNaN(v) ? null : v;
  },
});

interface InterpolationOverlayProps {
  points: { lat: number; lng: number; value: number }[];
  config: HeatmapConfig;
  allValues: number[];
  /** Optional ref to the Leaflet layer for value lookups from click handlers */
  layerRef?: MutableRefObject<any>;
  /** Called after each render with the grid-space maximum point, or null when unavailable */
  onMaxPoint?: (info: { latlng: L.LatLng; value: number } | null) => void;
}

export default function InterpolationOverlay({
  points,
  config,
  allValues,
  layerRef,
  onMaxPoint,
}: InterpolationOverlayProps) {
  const context = useLeafletContext();
  const container = context.layerContainer || context.map;
  const localLayerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (localLayerRef.current) {
      container.removeLayer(localLayerRef.current);
      localLayerRef.current = null;
      if (layerRef) layerRef.current = null;
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
        opacity,
        onMaxPoint,
      },
    ) as L.Layer;

    container.addLayer(layer);
    localLayerRef.current = layer;
    if (layerRef) layerRef.current = layer;

    return () => {
      if (localLayerRef.current) {
        container.removeLayer(localLayerRef.current);
        localLayerRef.current = null;
        if (layerRef) layerRef.current = null;
        onMaxPoint?.(null);
      }
    };
  }, [container, points, config, allValues, layerRef, onMaxPoint]);

  return null;
}
