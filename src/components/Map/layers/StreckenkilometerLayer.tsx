'use client';

import L from 'leaflet';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayerGroup, Marker, Popup, useMap } from 'react-leaflet';
import {
  filterVisiblePoints,
  formatKm,
  SimpleBounds,
  StreckenkilometerPoint,
} from './streckenkilometerUtils';

export const STRECKENKILOMETER_LAYER_NAME = 'Streckenkilometer';
const GEOJSON_URL = '/data/streckenkilometer.geojson';
const BOUNDS_PADDING = 0.2;

interface StreckenkilometerFeature {
  geometry: { coordinates: [number, number] };
  properties: { strasse: string; km: number; richtung?: string };
}

const iconCache = new Map<string, L.DivIcon>();

function getKmTafelIcon(label: string): L.DivIcon {
  let icon = iconCache.get(label);
  if (!icon) {
    icon = L.divIcon({
      html: `<div style="display:inline-block;background:#003d8f;color:#fff;border:1px solid #fff;border-radius:3px;padding:1px 4px;font-size:11px;font-weight:bold;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.5);transform:translate(-50%,-50%);">${label}</div>`,
      className: '',
      iconSize: undefined,
      iconAnchor: [0, 0],
    });
    iconCache.set(label, icon);
  }
  return icon;
}

function useLayerVisible(): boolean {
  const map = useMap();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onAdd = (e: L.LayersControlEvent) => {
      if (e.name === STRECKENKILOMETER_LAYER_NAME) setVisible(true);
    };
    const onRemove = (e: L.LayersControlEvent) => {
      if (e.name === STRECKENKILOMETER_LAYER_NAME) setVisible(false);
    };
    map.on('overlayadd', onAdd as L.LeafletEventHandlerFn);
    map.on('overlayremove', onRemove as L.LeafletEventHandlerFn);
    return () => {
      map.off('overlayadd', onAdd as L.LeafletEventHandlerFn);
      map.off('overlayremove', onRemove as L.LeafletEventHandlerFn);
    };
  }, [map]);

  return visible;
}

function useViewport(): { zoom: number; bounds: SimpleBounds } {
  const map = useMap();

  const readViewport = useCallback(() => {
    const bounds = map.getBounds().pad(BOUNDS_PADDING);
    return {
      zoom: map.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
    };
  }, [map]);

  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    map.on('moveend', update);
    map.on('zoomend', update);
    return () => {
      map.off('moveend', update);
      map.off('zoomend', update);
    };
  }, [map, readViewport]);

  return viewport;
}

function useStreckenkilometerData(
  visible: boolean
): StreckenkilometerPoint[] {
  const [points, setPoints] = useState<StreckenkilometerPoint[]>([]);

  useEffect(() => {
    if (!visible || points.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(GEOJSON_URL);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const geojson = await response.json();
        if (cancelled) return;
        setPoints(
          (geojson.features as StreckenkilometerFeature[]).map((feature) => ({
            strasse: feature.properties.strasse,
            km: feature.properties.km,
            richtung: feature.properties.richtung,
            lng: feature.geometry.coordinates[0],
            lat: feature.geometry.coordinates[1],
          }))
        );
      } catch (err) {
        console.error('Streckenkilometer konnten nicht geladen werden', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, points.length]);

  return points;
}

export default function StreckenkilometerLayer() {
  const t = useTranslations('streckenkilometer');
  const visible = useLayerVisible();
  const points = useStreckenkilometerData(visible);
  const { zoom, bounds } = useViewport();

  const markers = useMemo(
    () => (visible ? filterVisiblePoints(points, zoom, bounds) : []),
    [visible, points, zoom, bounds]
  );

  return (
    <LayerGroup attribution='Streckenkilometer: <a href="https://www.gip.gv.at" target="_blank" rel="noopener noreferrer">gip.gv.at</a> (CC BY 4.0)'>
      {markers.map((point) => {
        const label = `${point.strasse} ${formatKm(point.km)}`;
        return (
          <Marker
            position={[point.lat, point.lng]}
            icon={getKmTafelIcon(label)}
            key={`${point.strasse}-${point.km}-${point.richtung || ''}`}
          >
            <Popup>
              <b>
                {point.strasse} km {formatKm(point.km)}
              </b>
              {point.richtung && (
                <>
                  <br />
                  {t('direction')}: {point.richtung}
                </>
              )}
            </Popup>
          </Marker>
        );
      })}
    </LayerGroup>
  );
}
