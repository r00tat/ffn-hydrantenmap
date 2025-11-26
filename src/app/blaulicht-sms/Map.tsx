'use client';

import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  LayersControl,
} from 'react-leaflet';
import { availableLayers, overlayLayers } from '../../components/Map/tiles';
import L from 'leaflet';
import FirecallItemsLayer from '../../components/Map/layers/FirecallItemsLayer';
import Clusters from '../../components/Map/Clusters';

interface AlarmMapProps {
  lat: number;
  lon: number;
  alarmText: string;
}

const AlarmMap: React.FC<AlarmMapProps> = ({ lat, lon, alarmText }) => {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: '/icons/leaflet/marker-icon-2x.png',
      iconUrl: '/icons/leaflet/marker-icon.png',
      shadowUrl: '/icons/leaflet/marker-shadow.png',
    });
  }, []);

  if (typeof window === 'undefined' || !lat || !lon) {
    return null; // Don't render on the server or if coordinates are missing
  }

  const position: [number, number] = [lat, lon];
  const tileLayer = availableLayers.basemap_ortofoto;
  const addressOverlay = overlayLayers.adressen;

  return (
    <MapContainer
      center={position}
      zoom={15}
      style={{ height: '400px', width: '100%', marginTop: '20px' }}
    >
      <TileLayer url={tileLayer.url} {...tileLayer.options} />
      <TileLayer
        url={addressOverlay.url}
        {...addressOverlay.options}
        zIndex={2}
      />
      <LayersControl position="topright">
        <Clusters clustered={false} />
      </LayersControl>
      <Marker position={position}>
        <Popup>{alarmText}</Popup>
      </Marker>
    </MapContainer>
  );
};

export default AlarmMap;
