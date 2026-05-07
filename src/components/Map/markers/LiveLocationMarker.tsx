'use client';

import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import {
  computeInitials,
  computeOpacity,
  pickAvatarColor,
} from '../../../common/liveLocation';
import type { DisplayableLiveLocation } from '../../../hooks/useLiveLocations';

export const formatRelative = (ms: number): string => {
  const ageSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (ageSec < 60) return `vor ${ageSec} s`;
  const m = Math.round(ageSec / 60);
  return `vor ${m} min`;
};

export interface IconHtmlOptions {
  initials: string;
  color: string;
  displayName: string;
  opacity: number;
}

/** Pure helper: builds the divIcon HTML so it can be unit-tested. */
export function buildIconHtml({
  initials,
  color,
  displayName,
  opacity,
}: IconHtmlOptions): string {
  return `
    <div style="display:flex;align-items:center;gap:4px;opacity:${opacity};pointer-events:auto;">
      <div style="
        width:32px;height:32px;border-radius:50%;
        background:${color};color:#fff;
        display:flex;align-items:center;justify-content:center;
        font:bold 12px sans-serif;
        border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4);
      ">${initials}</div>
      <div style="
        background:rgba(255,255,255,.85);
        padding:2px 6px;border-radius:4px;
        font:11px sans-serif;color:#222;white-space:nowrap;
        box-shadow:0 1px 2px rgba(0,0,0,.2);
      ">${displayName}</div>
    </div>`;
}

export default function LiveLocationMarker({
  loc,
}: {
  loc: DisplayableLiveLocation;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const opacity = computeOpacity(loc.updatedAtMs);
  const initials = computeInitials(loc.name, loc.email);
  const color = pickAvatarColor(loc.uid);
  const displayName = loc.name || loc.email;

  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: buildIconHtml({ initials, color, displayName, opacity }),
        iconSize: [120, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      }),
    [opacity, initials, color, displayName]
  );

  if (opacity <= 0) return null;

  return (
    <Marker position={{ lat: loc.lat, lng: loc.lng }} icon={icon}>
      <Popup>
        <strong>{displayName}</strong>
        <br />
        zuletzt aktualisiert {formatRelative(loc.updatedAtMs)}
      </Popup>
    </Marker>
  );
}
