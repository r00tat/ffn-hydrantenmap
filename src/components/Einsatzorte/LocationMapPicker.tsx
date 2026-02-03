'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
          zoom={14}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
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
