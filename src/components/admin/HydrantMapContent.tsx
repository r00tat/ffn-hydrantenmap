'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface HydrantMapContentProps {
  newLat: number;
  newLng: number;
  existingLat?: number;
  existingLng?: number;
}

export default function HydrantMapContent({
  newLat,
  newLng,
  existingLat,
  existingLng,
}: HydrantMapContentProps) {
  const hasExisting = typeof existingLat === 'number' && typeof existingLng === 'number';

  // Center between both points, or on the new point
  const centerLat = hasExisting ? (newLat + existingLat) / 2 : newLat;
  const centerLng = hasExisting ? (newLng + existingLng) / 2 : newLng;

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={17}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* New hydrant (from CSV) */}
      <CircleMarker
        center={[newLat, newLng]}
        radius={10}
        pathOptions={{ color: '#2e7d32', fillColor: '#4caf50', fillOpacity: 0.8, weight: 2 }}
      >
        <Popup>Neu (CSV)</Popup>
      </CircleMarker>

      {/* Existing hydrant */}
      {hasExisting && (
        <CircleMarker
          center={[existingLat, existingLng]}
          radius={10}
          pathOptions={{ color: '#1565c0', fillColor: '#42a5f5', fillOpacity: 0.8, weight: 2 }}
        >
          <Popup>Bestehend</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
