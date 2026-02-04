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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FirecallLocation, LocationStatus } from '../firebase/firestore';
import StatusChip from './StatusChip';
import LocationMapPicker from './LocationMapPicker';
import VehicleAutocomplete from './VehicleAutocomplete';
import { geocodeAddress } from './geocode';

interface EinsatzorteCardProps {
  location: FirecallLocation;
  isNew?: boolean;
  onChange: (updates: Partial<FirecallLocation>) => void;
  onDelete?: () => void;
  onAdd?: (location: Partial<FirecallLocation>) => void;
  vehicleSuggestions: string[];
  kostenersatzVehicleNames: Set<string>;
  onKostenersatzVehicleAdded?: (vehicleName: string, location: FirecallLocation) => void;
}

export default function EinsatzorteCard({
  location,
  isNew = false,
  onChange,
  onDelete,
  onAdd,
  vehicleSuggestions,
  kostenersatzVehicleNames,
  onKostenersatzVehicleAdded,
}: EinsatzorteCardProps) {
  // Generate a stable ID for new cards so the document ID is predetermined
  const stableId = useMemo(
    () => (isNew ? crypto.randomUUID() : location.id),
    [isNew, location.id]
  );

  const [local, setLocal] = useState<Partial<FirecallLocation>>(() => ({
    ...location,
    id: stableId,
  }));
  const [mapOpen, setMapOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const geocodeRef = useRef<NodeJS.Timeout | null>(null);
  const prevAddressRef = useRef({ street: location.street, number: location.number });
  const cardRef = useRef<HTMLDivElement>(null);
  const localRef = useRef(local);

  // Keep localRef in sync for use in blur handler
  useEffect(() => {
    localRef.current = local;
  }, [local]);

  useEffect(() => {
    setLocal({ ...location, id: stableId });
    prevAddressRef.current = { street: location.street, number: location.number };
  }, [location, stableId]);

  // Handle card blur - save new card when focus leaves the entire card
  const handleCardBlur = useCallback(
    (e: React.FocusEvent) => {
      // Check if the new focus target is outside this card
      if (cardRef.current && !cardRef.current.contains(e.relatedTarget as Node)) {
        if (isNew && (localRef.current.name || localRef.current.street)) {
          onAdd?.(localRef.current);
        }
      }
    },
    [isNew, onAdd]
  );

  // Handle Enter key to add new card
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isNew && (localRef.current.name || localRef.current.street)) {
        e.preventDefault();
        onAdd?.(localRef.current);
      }
    },
    [isNew, onAdd]
  );

  const handleFieldChange = useCallback(
    (field: keyof FirecallLocation, value: string | string[] | LocationStatus) => {
      const updated = { ...local, [field]: value };

      // Auto-set time fields based on status changes
      if (field === 'status') {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        if (value === 'in arbeit' && !local.startTime) {
          updated.startTime = currentTime;
        } else if ((value === 'erledigt' || value === 'kein einsatz') && !local.doneTime) {
          updated.doneTime = currentTime;
        }
      }

      setLocal(updated);

      // Geocode on address change (for both new and existing cards)
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

      // For new cards, don't auto-save - wait for Enter key or blur
      if (isNew) {
        return;
      }

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // For existing cards, debounce auto-save
      // Include auto-filled time fields when status changes
      debounceRef.current = setTimeout(() => {
        const updates: Partial<FirecallLocation> = { [field]: value };
        if (field === 'status') {
          if (updated.startTime && updated.startTime !== local.startTime) {
            updates.startTime = updated.startTime;
          }
          if (updated.doneTime && updated.doneTime !== local.doneTime) {
            updates.doneTime = updated.doneTime;
          }
        }
        onChange(updates);
      }, 500);
    },
    [local, isNew, onChange]
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

  const handleVehiclesChange = useCallback(
    (vehicles: string[]) => {
      handleFieldChange('vehicles', vehicles);
    },
    [handleFieldChange]
  );

  const handleKostenersatzVehicleAdded = useCallback(
    (vehicleName: string) => {
      if (onKostenersatzVehicleAdded && local.id) {
        // Pass the full location with updated vehicles
        onKostenersatzVehicleAdded(vehicleName, local as FirecallLocation);
      }
    },
    [onKostenersatzVehicleAdded, local]
  );

  // Get vehicles as array, handling both old string format and new array format
  const vehiclesArray = useMemo((): string[] => {
    const v = local.vehicles;
    if (Array.isArray(v)) return v;
    // Handle legacy string format (cast needed as type says string[] but old data may be string)
    if (typeof v === 'string' && (v as string).trim()) {
      return (v as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  }, [local.vehicles]);

  return (
    <>
      <Card ref={cardRef} onBlur={handleCardBlur} onKeyDown={handleKeyDown} sx={{ mb: 2, opacity: isNew ? 0.6 : 1 }}>
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

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Fahrzeuge:
            </Typography>
            <VehicleAutocomplete
              value={vehiclesArray}
              onChange={handleVehiclesChange}
              suggestions={vehicleSuggestions}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleAdded={handleKostenersatzVehicleAdded}
            />
          </Box>

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
