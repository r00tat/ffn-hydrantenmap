'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useState, useCallback } from 'react';
import {
  LayersControl,
  MapContainer,
  TileLayer,
  Marker,
  WMSTileLayer,
  useMapEvents,
} from 'react-leaflet';
import L, { LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { availableLayers, overlayLayers } from '../Map/tiles';
import Clusters from '../Map/Clusters';
import { DistanceLayer } from '../Map/layers/DistanceLayer';
import FirecallLayer from '../Map/layers/FirecallLayer';
import LocationsLayer from '../Map/layers/LocationsLayer';
import PowerOutageLayer from '../Map/layers/PowerOutageLayer';
import DistanceMarker from '../Map/markers/DistanceMarker';
import PositionMarker from '../Map/markers/PositionMarker';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/icons/leaflet/marker-icon-2x.png',
  iconUrl: '/icons/leaflet/marker-icon.png',
  shadowUrl: '/icons/leaflet/marker-shadow.png',
});

interface LocationMapPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
  center?: { lat: number; lng: number };
}

function ClickHandler({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationMapPicker({
  open,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
  center = { lat: 47.9485, lng: 16.8452 }, // Neusiedl am See default
}: LocationMapPickerProps) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );

  const handleClick = useCallback((lat: number, lng: number) => {
    setPosition({ lat, lng });
  }, []);

  const handleConfirm = useCallback(() => {
    if (position) {
      onConfirm(position.lat, position.lng);
    }
    onClose();
  }, [position, onConfirm, onClose]);

  const mapCenter = position || center;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Position auf Karte wählen</DialogTitle>
      <DialogContent sx={{ height: 400, p: 0 }}>
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={15}
          maxZoom={24}
          style={{ height: '100%', width: '100%' }}
        >
          <LayersControl position="topright">
            {Object.entries(availableLayers).map(([key, layer], index) => (
              <LayersControl.BaseLayer
                checked={index === 0}
                name={layer.name}
                key={key}
              >
                <TileLayer
                  attribution={layer.options.attribution}
                  url={layer.url}
                  maxZoom={layer.options.maxZoom}
                  maxNativeZoom={layer.options.maxNativeZoom}
                  bounds={layer.options.bounds}
                  subdomains={layer.options.subdomains}
                  key={key}
                />
              </LayersControl.BaseLayer>
            ))}
            {Object.entries(overlayLayers)
              .filter(([key, layer]) => (layer.type || 'WTMS') === 'WTMS')
              .map(([key, layer]) => (
                <LayersControl.Overlay
                  name={layer.name}
                  key={key}
                  checked={layer.enabled}
                >
                  <TileLayer
                    attribution={layer.options.attribution}
                    url={layer.url}
                    maxZoom={layer.options.maxZoom}
                    maxNativeZoom={layer.options.maxNativeZoom}
                    bounds={layer.options.bounds}
                    subdomains={layer.options.subdomains}
                    key={key}
                  />
                </LayersControl.Overlay>
              ))}
            {Object.entries(overlayLayers)
              .filter(([key, layer]) => layer.type === 'WMS')
              .map(([key, layer]) => (
                <LayersControl.Overlay name={layer.name} key={key}>
                  <WMSTileLayer
                    layers={layer.options.layers}
                    attribution={layer.options.attribution}
                    url={layer.url}
                    maxZoom={layer.options.maxZoom}
                    maxNativeZoom={layer.options.maxNativeZoom}
                    bounds={layer.options.bounds}
                    subdomains={layer.options.subdomains}
                    key={key}
                    format={layer.options.format}
                    transparent={layer.options.transparent}
                    tileSize={512}
                    uppercase={layer.options.uppercase}
                  />
                </LayersControl.Overlay>
              ))}
            <FirecallLayer defaultChecked={false} />
            <LayersControl.Overlay name="Einsatzorte" checked>
              <LocationsLayer />
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Entfernung">
              <DistanceMarker />
            </LayersControl.Overlay>
            <Clusters
              defaultChecked={{
                hydranten: false,
                saugstellen: false,
                risikoobjekte: true,
              }}
            />
            <LayersControl.Overlay name="Umkreis">
              <DistanceLayer />
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Position">
              <PositionMarker />
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Stromausfälle">
              <PowerOutageLayer />
            </LayersControl.Overlay>
          </LayersControl>
          <ClickHandler onClick={handleClick} />
          {position && <Marker position={[position.lat, position.lng]} />}
        </MapContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button onClick={handleConfirm} variant="contained" disabled={!position}>
          Übernehmen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
