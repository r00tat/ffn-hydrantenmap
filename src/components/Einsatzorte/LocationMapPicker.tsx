'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  LayersControl,
  MapContainer,
  TileLayer,
  Marker,
  WMSTileLayer,
  useMap,
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
import PegelstandLayer from '../Map/layers/PegelstandLayer';
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
  /** Hide firecall-related layers (FirecallLayer, Einsatzorte). Default: true */
  showFirecallLayers?: boolean;
  /** Custom dialog title. Default: "Position auf Karte wählen" */
  title?: string;
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

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prevRef = useRef({ lat: 0, lng: 0 });
  if (prevRef.current.lat !== lat || prevRef.current.lng !== lng) {
    prevRef.current = { lat, lng };
    map.flyTo([lat, lng], 15);
  }
  return null;
}

export default function LocationMapPicker({
  open,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
  center = { lat: 47.9485, lng: 16.8452 }, // Neusiedl am See default
  showFirecallLayers = true,
  title = 'Position auf Karte wählen',
}: LocationMapPickerProps) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Reset state when the dialog opens
  useEffect(() => {
    if (open) {
      const initial =
        initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null;
      setPosition(initial);
      setFlyTarget(initial);
      setSearchQuery('');
    }
  }, [open, initialLat, initialLng]);

  const handleClick = useCallback((lat: number, lng: number) => {
    setPosition({ lat, lng });
  }, []);

  const handleConfirm = useCallback(() => {
    if (position) {
      onConfirm(position.lat, position.lng);
    }
    onClose();
  }, [position, onConfirm, onClose]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q,
        format: 'json',
        limit: '1',
        countrycodes: 'at',
      });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'Accept-Language': 'de' } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setFlyTarget({ lat, lng });
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const mapCenter = position || center;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ whiteSpace: 'nowrap' }}>{title}</span>
          <TextField
            size="small"
            placeholder="Ort suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            sx={{ flex: 1 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleSearch}
                      disabled={searching || !searchQuery.trim()}
                      size="small"
                      edge="end"
                    >
                      {searching ? (
                        <CircularProgress size={20} />
                      ) : (
                        <SearchIcon />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
      </DialogTitle>
      <DialogContent sx={{ height: '70vh', p: 0 }}>
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
            {showFirecallLayers && (
              <FirecallLayer defaultChecked={false} />
            )}
            {showFirecallLayers && (
              <LayersControl.Overlay name="Einsatzorte" checked>
                <LocationsLayer />
              </LayersControl.Overlay>
            )}
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
            <LayersControl.Overlay name="Pegelstände">
              <PegelstandLayer />
            </LayersControl.Overlay>
          </LayersControl>
          <ClickHandler onClick={handleClick} />
          {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
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
