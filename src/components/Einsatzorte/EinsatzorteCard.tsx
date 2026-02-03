'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FirecallLocation, LocationStatus } from '../firebase/firestore';
import StatusChip from './StatusChip';
import LocationMapPicker from './LocationMapPicker';
import { geocodeAddress } from './geocode';

interface EinsatzorteCardProps {
  location: FirecallLocation;
  isNew?: boolean;
  onChange: (updates: Partial<FirecallLocation>) => void;
  onDelete?: () => void;
  onAdd?: (location: Partial<FirecallLocation>) => void;
}

export default function EinsatzorteCard({
  location,
  isNew = false,
  onChange,
  onDelete,
  onAdd,
}: EinsatzorteCardProps) {
  const [local, setLocal] = useState<Partial<FirecallLocation>>(location);
  const [mapOpen, setMapOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const geocodeRef = useRef<NodeJS.Timeout | null>(null);
  const prevAddressRef = useRef({ street: location.street, number: location.number });

  useEffect(() => {
    setLocal(location);
    prevAddressRef.current = { street: location.street, number: location.number };
  }, [location]);

  const handleFieldChange = useCallback(
    (field: keyof FirecallLocation, value: string | LocationStatus) => {
      const updated = { ...local, [field]: value };
      setLocal(updated);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (isNew) {
          if (updated.name || updated.street) {
            onAdd?.(updated);
          }
        } else {
          onChange({ [field]: value });
        }
      }, 500);

      // Geocode on address change
      if (field === 'street' || field === 'number') {
        const newStreet = field === 'street' ? (value as string) : local.street || '';
        const newNumber = field === 'number' ? (value as string) : local.number || '';

        if (
          newStreet &&
          newNumber &&
          (newStreet !== prevAddressRef.current.street ||
            newNumber !== prevAddressRef.current.number)
        ) {
          if (geocodeRef.current) {
            clearTimeout(geocodeRef.current);
          }

          geocodeRef.current = setTimeout(async () => {
            const coords = await geocodeAddress(newStreet, newNumber, local.city || 'Neusiedl am See');
            if (coords) {
              setLocal((prev) => ({ ...prev, lat: coords.lat, lng: coords.lng }));
              if (!isNew) {
                onChange({ lat: coords.lat, lng: coords.lng });
              }
              prevAddressRef.current = { street: newStreet, number: newNumber };
            }
          }, 1000);
        }
      }
    },
    [local, isNew, onChange, onAdd]
  );

  const handleMapConfirm = useCallback(
    (lat: number, lng: number) => {
      setLocal((prev) => ({ ...prev, lat, lng }));
      if (!isNew) {
        onChange({ lat, lng });
      }
    },
    [isNew, onChange]
  );

  return (
    <>
      <Card sx={{ mb: 2, opacity: isNew ? 0.6 : 1 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <StatusChip
              status={(local.status as LocationStatus) || 'offen'}
              onChange={(status) => handleFieldChange('status', status)}
            />
            {!isNew && onDelete && (
              <IconButton size="small" onClick={onDelete} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>

          <TextField
            value={local.name || ''}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            size="small"
            fullWidth
            placeholder={isNew ? 'Neue Adresse...' : 'Bezeichnung'}
            variant="outlined"
            sx={{ mb: 2 }}
          />

          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              value={local.street || ''}
              onChange={(e) => handleFieldChange('street', e.target.value)}
              size="small"
              placeholder="Straße"
              sx={{ flex: 2 }}
            />
            <TextField
              value={local.number || ''}
              onChange={(e) => handleFieldChange('number', e.target.value)}
              size="small"
              placeholder="Nr."
              sx={{ flex: 0.5 }}
            />
          </Stack>

          <TextField
            value={local.city || ''}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            size="small"
            fullWidth
            placeholder="Ort"
            sx={{ mb: 2 }}
          />

          <TextField
            value={local.vehicles || ''}
            onChange={(e) => handleFieldChange('vehicles', e.target.value)}
            size="small"
            fullWidth
            placeholder="Fahrzeuge"
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Alarmiert
              </Typography>
              <TextField
                type="time"
                value={local.alarmTime || ''}
                onChange={(e) => handleFieldChange('alarmTime', e.target.value)}
                size="small"
                fullWidth
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Start
              </Typography>
              <TextField
                type="time"
                value={local.startTime || ''}
                onChange={(e) => handleFieldChange('startTime', e.target.value)}
                size="small"
                fullWidth
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Erledigt
              </Typography>
              <TextField
                type="time"
                value={local.doneTime || ''}
                onChange={(e) => handleFieldChange('doneTime', e.target.value)}
                size="small"
                fullWidth
              />
            </Box>
          </Stack>

          <TextField
            value={local.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            placeholder="Beschreibung"
            sx={{ mb: 2 }}
          />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {local.lat && local.lng
                ? `${local.lat.toFixed(5)}, ${local.lng.toFixed(5)}`
                : 'Keine Koordinaten'}
            </Typography>
            <IconButton onClick={() => setMapOpen(true)}>
              <MyLocationIcon />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      <LocationMapPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={handleMapConfirm}
        initialLat={local.lat}
        initialLng={local.lng}
      />
    </>
  );
}
