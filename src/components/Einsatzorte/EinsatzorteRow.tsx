'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NavigateButton from '../common/NavigateButton';
import { FirecallLocation, LocationStatus, Fzg } from '../firebase/firestore';
import StatusChip from './StatusChip';
import LocationMapPicker from './LocationMapPicker';
import VehicleAutocomplete from './VehicleAutocomplete';
import { geocodeAddress } from './geocode';

interface EinsatzorteRowProps {
  location: FirecallLocation;
  isNew?: boolean;
  onChange: (updates: Partial<FirecallLocation>) => void;
  onDelete?: () => void;
  onAdd?: (location: Partial<FirecallLocation>) => void;
  mapVehicles: Fzg[];
  kostenersatzVehicleNames: Set<string>;
  onKostenersatzVehicleSelected?: (vehicleName: string, location: FirecallLocation) => void;
  onMapVehicleSelected?: (vehicleId: string, vehicleName: string, location: FirecallLocation) => void;
  onCreateVehicle?: (name: string, fw: string, location: FirecallLocation) => void;
}

export default function EinsatzorteRow({
  location,
  isNew = false,
  onChange,
  onDelete,
  onAdd,
  mapVehicles,
  kostenersatzVehicleNames,
  onKostenersatzVehicleSelected,
  onMapVehicleSelected,
  onCreateVehicle,
}: EinsatzorteRowProps) {
  // Track a unique key for resetting the new row after add
  const [resetKey, setResetKey] = useState(0);

  // Generate a stable ID for new rows so the document ID is predetermined
  // resetKey forces regeneration after a successful add
  const stableId = useMemo(
    () => (isNew ? crypto.randomUUID() : location.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isNew, location.id, resetKey]
  );

  const [local, setLocal] = useState<Partial<FirecallLocation>>(() => ({
    ...location,
    id: stableId,
  }));
  const [mapOpen, setMapOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const geocodeRef = useRef<NodeJS.Timeout | null>(null);
  const prevAddressRef = useRef({ street: location.street, number: location.number });
  const rowRef = useRef<HTMLTableRowElement>(null);
  const localRef = useRef(local);

  // Keep localRef in sync for use in blur handler
  useEffect(() => {
    localRef.current = local;
  }, [local]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (geocodeRef.current) {
        clearTimeout(geocodeRef.current);
      }
    };
  }, []);

  // Sync from parent when location changes (e.g., real-time updates)
  useEffect(() => {
    setLocal({ ...location, id: stableId });
    prevAddressRef.current = { street: location.street, number: location.number };
  }, [location, stableId]);

  // Geocode on mount if existing row has address but no coordinates
  // This handles the case where a new row was added before geocoding completed
  useEffect(() => {
    if (
      !isNew &&
      location.street &&
      location.number &&
      location.lat === undefined &&
      location.lng === undefined
    ) {
      geocodeAddress(location.street, location.number, location.city || 'Neusiedl am See').then(
        (coords) => {
          if (coords) {
            onChange({ lat: coords.lat, lng: coords.lng });
          }
        }
      );
    }
    // Only run on mount for existing rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset the new row state after a successful add
  const resetNewRow = useCallback(() => {
    const newId = crypto.randomUUID();
    setLocal({ ...location, id: newId });
    setResetKey((k) => k + 1);
    prevAddressRef.current = { street: location.street, number: location.number };
  }, [location]);

  // Handle row blur - save new row when focus leaves the entire row
  // Using setTimeout because relatedTarget can be null in certain browsers/situations
  // even when tabbing between fields within the same row
  const handleRowBlur = useCallback(() => {
    if (!isNew) return;

    // Use setTimeout to let the focus settle, then check if focus is still in the row
    setTimeout(() => {
      const activeElement = document.activeElement;
      const focusStillInRow = rowRef.current?.contains(activeElement);

      if (!focusStillInRow && (localRef.current.name || localRef.current.street)) {
        // Clear pending geocode - it will run on the wrong component instance after add
        if (geocodeRef.current) {
          clearTimeout(geocodeRef.current);
          geocodeRef.current = null;
        }
        onAdd?.(localRef.current);
        resetNewRow();
      }
    }, 0);
  }, [isNew, onAdd, resetNewRow]);

  // Handle Enter key to add new row
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && isNew && (localRef.current.name || localRef.current.street)) {
        e.preventDefault();
        // Clear pending geocode - it will run on the wrong component instance after add
        if (geocodeRef.current) {
          clearTimeout(geocodeRef.current);
          geocodeRef.current = null;
        }
        onAdd?.(localRef.current);
        resetNewRow();
      }
    },
    [isNew, onAdd, resetNewRow]
  );

  const handleFieldChange = useCallback(
    (field: keyof FirecallLocation, value: string | Record<string, string> | LocationStatus) => {
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

      // Geocode on address change (for both new and existing rows)
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

      // For new rows, don't auto-save - wait for Enter key or blur
      if (isNew) {
        return;
      }

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // For existing rows, debounce auto-save
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
    (vehicles: Record<string, string>) => {
      handleFieldChange('vehicles', vehicles);
    },
    [handleFieldChange]
  );

  const handleKostenersatzVehicleSelected = useCallback(
    (vehicleName: string) => {
      if (onKostenersatzVehicleSelected && local.id) {
        onKostenersatzVehicleSelected(vehicleName, local as FirecallLocation);
      }
    },
    [onKostenersatzVehicleSelected, local]
  );

  const handleMapVehicleSelected = useCallback(
    (vehicleId: string, vehicleName: string) => {
      if (onMapVehicleSelected && local.id) {
        onMapVehicleSelected(vehicleId, vehicleName, local as FirecallLocation);
      }
    },
    [onMapVehicleSelected, local]
  );

  const handleCreateVehicle = useCallback(
    (name: string, fw: string) => {
      if (onCreateVehicle && local.id) {
        onCreateVehicle(name, fw, local as FirecallLocation);
      }
    },
    [onCreateVehicle, local]
  );

  const coordsText =
    local.lat && local.lng
      ? `${local.lat.toFixed(5)}, ${local.lng.toFixed(5)}`
      : '';

  return (
    <>
      <TableRow ref={rowRef} onBlur={handleRowBlur} onKeyDown={handleKeyDown}>
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
        <TableCell sx={{ minWidth: 350 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <TextField
              value={local.street || ''}
              onChange={(e) => handleFieldChange('street', e.target.value)}
              size="small"
              placeholder="Straße"
              variant="standard"
              sx={{ flex: 2, minWidth: 150, mr: 1 }}
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
              sx={{ flex: 1, minWidth: 100 }}
            />
          </Box>
        </TableCell>
        <TableCell>
          <StatusChip
            status={(local.status as LocationStatus) || 'offen'}
            onChange={(status) => handleFieldChange('status', status)}
          />
        </TableCell>
        <TableCell sx={{ minWidth: 200 }}>
          <VehicleAutocomplete
            value={(local.vehicles as Record<string, string>) || {}}
            onChange={handleVehiclesChange}
            mapVehicles={mapVehicles}
            kostenersatzVehicleNames={kostenersatzVehicleNames}
            onKostenersatzVehicleSelected={handleKostenersatzVehicleSelected}
            onMapVehicleSelected={handleMapVehicleSelected}
            onCreateVehicle={handleCreateVehicle}
          />
        </TableCell>
        <TableCell>
          <TextField
            value={local.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            size="small"
            fullWidth
            multiline
            maxRows={3}
            placeholder="Beschreibung"
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
                <>
                  {!isNew && <NavigateButton lat={local.lat} lng={local.lng} />}
                  <Tooltip title="Auf Karte wählen">
                    <IconButton size="small" onClick={() => setMapOpen(true)}>
                      <MyLocationIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
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
