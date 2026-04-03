'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import useFirecall from '../../hooks/useFirecall';
import useVehicles from '../../hooks/useVehicles';
import useFirecallLocations from '../../hooks/useFirecallLocations';

/**
 * Fits the map bounds to include all firecall items, locations,
 * and the firecall position. Runs once when items are loaded.
 */
export default function FitBoundsToItems() {
  const map = useMap();
  const firecall = useFirecall();
  const { firecallItems } = useVehicles();
  const { locations } = useFirecallLocations();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    if (firecallItems.length === 0 && locations.length === 0) return;

    const points: L.LatLngExpression[] = [];

    if (firecall.lat != null && firecall.lng != null) {
      points.push([firecall.lat, firecall.lng]);
    }

    for (const item of firecallItems) {
      if (item.lat != null && item.lng != null) {
        points.push([item.lat, item.lng]);
      }
    }

    for (const loc of locations) {
      if (loc.lat != null && loc.lng != null) {
        points.push([loc.lat, loc.lng]);
      }
    }

    if (points.length === 0) return;

    fitted.current = true;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  }, [map, firecall, firecallItems, locations]);

  return null;
}
