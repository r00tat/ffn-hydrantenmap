'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import IconButton from '@mui/material/IconButton';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FirecallLocation, LocationStatus } from '../firebase/firestore';
import StatusChip from './StatusChip';
import LocationMapPicker from './LocationMapPicker';
import { geocodeAddress } from './geocode';

interface EinsatzorteRowProps {
  location: FirecallLocation;
  isNew?: boolean;
  onChange: (updates: Partial<FirecallLocation>) => void;
  onDelete?: () => void;
  onAdd?: (location: Partial<FirecallLocation>) => void;
}

export default function EinsatzorteRow({
  location,
  isNew = false,
  onChange,
  onDelete,
  onAdd,
}: EinsatzorteRowProps) {
  const [local, setLocal] = useState<Partial<FirecallLocation>>(location);
  const [mapOpen, setMapOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const geocodeRef = useRef<NodeJS.Timeout | null>(null);
  const prevAddressRef = useRef({ street: location.street, number: location.number });

  // Sync from parent when location changes (e.g., real-time updates)
  useEffect(() => {
    setLocal(location);
    prevAddressRef.current = { street: location.street, number: location.number };
  }, [location]);

  const handleFieldChange = useCallback(
    (field: keyof FirecallLocation, value: string | LocationStatus) => {
      const updated = { ...local, [field]: value };
      setLocal(updated);

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (isNew) {
          // Check if we have enough data to create
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

  const coordsText =
    local.lat && local.lng
      ? `${local.lat.toFixed(5)}, ${local.lng.toFixed(5)}`
      : '';

  return (
    <>
      <TableRow sx={{ opacity: isNew ? 0.6 : 1 }}>
        <TableCell sx={{ minWidth: 130 }}>
          <StatusChip
            status={(local.status as LocationStatus) || 'offen'}
            onChange={(status) => handleFieldChange('status', status)}
          />
        </TableCell>
        <TableCell>
          <TextField
            value={local.name || ''}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            size="small"
            fullWidth
            placeholder={isNew ? 'Neue Adresse...' : ''}
            variant="standard"
          />
        </TableCell>
        <TableCell>
          <TextField
            value={local.street || ''}
            onChange={(e) => handleFieldChange('street', e.target.value)}
            size="small"
            placeholder="Straße"
            variant="standard"
            sx={{ width: 120, mr: 1 }}
          />
          <TextField
            value={local.number || ''}
            onChange={(e) => handleFieldChange('number', e.target.value)}
            size="small"
            placeholder="Nr."
            variant="standard"
            sx={{ width: 50, mr: 1 }}
          />
          <TextField
            value={local.city || ''}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            size="small"
            placeholder="Ort"
            variant="standard"
            sx={{ width: 120 }}
          />
        </TableCell>
        <TableCell>
          <TextField
            value={local.vehicles || ''}
            onChange={(e) => handleFieldChange('vehicles', e.target.value)}
            size="small"
            fullWidth
            placeholder="Fahrzeuge"
            variant="standard"
          />
        </TableCell>
        <TableCell>
          <TextField
            type="time"
            value={local.alarmTime || ''}
            onChange={(e) => handleFieldChange('alarmTime', e.target.value)}
            size="small"
            variant="standard"
            sx={{ width: 80 }}
          />
        </TableCell>
        <TableCell>
          <TextField
            type="time"
            value={local.startTime || ''}
            onChange={(e) => handleFieldChange('startTime', e.target.value)}
            size="small"
            variant="standard"
            sx={{ width: 80 }}
          />
        </TableCell>
        <TableCell>
          <TextField
            type="time"
            value={local.doneTime || ''}
            onChange={(e) => handleFieldChange('doneTime', e.target.value)}
            size="small"
            variant="standard"
            sx={{ width: 80 }}
          />
        </TableCell>
        <TableCell>
          <TextField
            value={coordsText}
            size="small"
            variant="standard"
            sx={{ width: 140 }}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <Tooltip title="Auf Karte wählen">
                  <IconButton size="small" onClick={() => setMapOpen(true)}>
                    <MyLocationIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ),
            }}
          />
        </TableCell>
        <TableCell>
          {!isNew && onDelete && (
            <Tooltip title="Löschen">
              <IconButton size="small" onClick={onDelete} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>

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
