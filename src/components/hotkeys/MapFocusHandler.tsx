'use client';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import useMapEditor from '../../hooks/useMapEditor';
import { focusPoints, mapFocusRequests, usePendingRequest } from './pendingRequest';

const FOCUS_ZOOM = 18;
/**
 * Frisch gemountet richtet `FitBoundsToItems` den Ausschnitt noch einmal auf
 * alle Elemente aus, sobald sie geladen sind — danach wird nachgezogen.
 */
const SETTLE_MS = 2000;
const REFOCUS_MS = 900;

/**
 * Holt ein Element aus der globalen Suche ins Bild und wählt es aus (zeigt es
 * in der Seitenleiste). Sitzt in der Karte, damit `useMap` greift.
 */
export default function MapFocusHandler() {
  const map = useMap();
  const { selectFirecallItem } = useMapEditor();
  const mountedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mountedAt.current = Date.now();
    return () => clearTimeout(timer.current);
  }, []);

  usePendingRequest(mapFocusRequests, (item) => {
    const points = focusPoints(item);
    const focus = () => {
      if (points.length === 1) {
        map.setView(points[0], Math.max(map.getZoom(), FOCUS_ZOOM));
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: FOCUS_ZOOM });
      }
    };
    focus();
    selectFirecallItem(item);
    clearTimeout(timer.current);
    if (Date.now() - mountedAt.current < SETTLE_MS) {
      timer.current = setTimeout(focus, REFOCUS_MS);
    }
  });

  return null;
}
