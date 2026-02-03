# Multiple Call Locations (Einsatzorte) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to store and manage multiple locations per firecall with auto-saving editable table/cards and map display.

**Architecture:** New Firestore subcollection `/call/{firecallId}/location/` with real-time subscription hook. Dedicated page with responsive table (desktop) / cards (mobile). Map layer displays color-coded markers by status.

**Tech Stack:** Next.js App Router, React, MUI components, Firebase Firestore, React Leaflet, Nominatim geocoding.

---

## Task 1: Add FirecallLocation Interface

**Files:**
- Modify: `src/components/firebase/firestore.ts`

**Step 1: Add the interface and collection constant**

Add after the `FirecallHistory` interface (around line 182):

```typescript
export const FIRECALL_LOCATIONS_COLLECTION_ID = 'location';

export type LocationStatus = 'offen' | 'einsatz notwendig' | 'in arbeit' | 'erledigt' | 'kein einsatz';

export const LOCATION_STATUS_OPTIONS: LocationStatus[] = [
  'offen',
  'einsatz notwendig',
  'in arbeit',
  'erledigt',
  'kein einsatz',
];

export const LOCATION_STATUS_COLORS: Record<LocationStatus, string> = {
  'offen': 'yellow',
  'einsatz notwendig': 'red',
  'in arbeit': 'orange',
  'erledigt': 'green',
  'kein einsatz': 'green',
};

export interface FirecallLocation {
  id?: string;

  // Address
  street: string;
  number: string;
  city: string;

  // Details
  name: string;
  description: string;
  info: string;

  // Status
  status: LocationStatus;
  vehicles: string;

  // Times
  alarmTime?: string;
  startTime?: string;
  doneTime?: string;

  // Coordinates
  lat?: number;
  lng?: number;

  // Metadata
  created: string;
  creator: string;
  updatedAt?: string;
  updatedBy?: string;
  deleted?: boolean;
}

export const defaultFirecallLocation: Partial<FirecallLocation> = {
  street: '',
  number: '',
  city: 'Neusiedl am See',
  name: '',
  description: '',
  info: '',
  status: 'offen',
  vehicles: '',
};
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds without type errors

**Step 3: Commit**

```bash
git add src/components/firebase/firestore.ts
git commit -m "feat(einsatzorte): add FirecallLocation interface and constants"
```

---

## Task 2: Create useFirecallLocations Hook

**Files:**
- Create: `src/hooks/useFirecallLocations.ts`

**Step 1: Create the hook file**

```typescript
'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { useCallback, useMemo } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  FIRECALL_COLLECTION_ID,
  FIRECALL_LOCATIONS_COLLECTION_ID,
  FirecallLocation,
  defaultFirecallLocation,
} from '../components/firebase/firestore';
import useFirebaseCollection from './useFirebaseCollection';
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

export interface UseFirecallLocationsResult {
  locations: FirecallLocation[];
  loading: boolean;
  addLocation: (location: Partial<FirecallLocation>) => Promise<string>;
  updateLocation: (id: string, updates: Partial<FirecallLocation>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
}

export default function useFirecallLocations(): UseFirecallLocationsResult {
  const firecallId = useFirecallId();
  const { email } = useFirebaseLogin();

  const collectionPath = useMemo(
    () => [firecallId, FIRECALL_LOCATIONS_COLLECTION_ID],
    [firecallId]
  );

  const records = useFirebaseCollection<FirecallLocation>({
    collectionName: FIRECALL_COLLECTION_ID,
    pathSegments: collectionPath,
    filterFn: (loc) => loc.deleted !== true,
  });

  const locations = useMemo(
    () =>
      [...records].sort(
        (a, b) =>
          new Date(a.created || 0).getTime() - new Date(b.created || 0).getTime()
      ),
    [records]
  );

  const addLocation = useCallback(
    async (location: Partial<FirecallLocation>): Promise<string> => {
      const newData: FirecallLocation = {
        ...defaultFirecallLocation,
        ...location,
        created: new Date().toISOString(),
        creator: email || '',
      } as FirecallLocation;

      const docRef = await addDoc(
        collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_LOCATIONS_COLLECTION_ID
        ),
        newData
      );
      return docRef.id;
    },
    [email, firecallId]
  );

  const updateLocation = useCallback(
    async (id: string, updates: Partial<FirecallLocation>): Promise<void> => {
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: email || '',
      };

      await updateDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_LOCATIONS_COLLECTION_ID,
          id
        ),
        updateData
      );
    },
    [email, firecallId]
  );

  const deleteLocation = useCallback(
    async (id: string): Promise<void> => {
      await updateDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          FIRECALL_LOCATIONS_COLLECTION_ID,
          id
        ),
        { deleted: true, updatedAt: new Date().toISOString(), updatedBy: email }
      );
    },
    [email, firecallId]
  );

  return {
    locations,
    loading: false,
    addLocation,
    updateLocation,
    deleteLocation,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/hooks/useFirecallLocations.ts
git commit -m "feat(einsatzorte): add useFirecallLocations hook"
```

---

## Task 3: Create StatusChip Component

**Files:**
- Create: `src/components/Einsatzorte/StatusChip.tsx`

**Step 1: Create directory and component**

```typescript
'use client';

import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import {
  LocationStatus,
  LOCATION_STATUS_OPTIONS,
  LOCATION_STATUS_COLORS,
} from '../firebase/firestore';

interface StatusChipProps {
  status: LocationStatus;
  onChange: (status: LocationStatus) => void;
  readOnly?: boolean;
}

const statusLabels: Record<LocationStatus, string> = {
  'offen': 'Offen',
  'einsatz notwendig': 'Einsatz notwendig',
  'in arbeit': 'In Arbeit',
  'erledigt': 'Erledigt',
  'kein einsatz': 'Kein Einsatz',
};

export default function StatusChip({ status, onChange, readOnly }: StatusChipProps) {
  const color = LOCATION_STATUS_COLORS[status] || 'grey';

  if (readOnly) {
    return (
      <Chip
        label={statusLabels[status] || status}
        size="small"
        sx={{
          backgroundColor: color,
          color: color === 'yellow' ? 'black' : 'white',
        }}
      />
    );
  }

  return (
    <FormControl size="small" sx={{ minWidth: 130 }}>
      <Select
        value={status}
        onChange={(e: SelectChangeEvent) => onChange(e.target.value as LocationStatus)}
        sx={{
          backgroundColor: color,
          color: color === 'yellow' ? 'black' : 'white',
          '& .MuiSelect-icon': {
            color: color === 'yellow' ? 'black' : 'white',
          },
        }}
      >
        {LOCATION_STATUS_OPTIONS.map((opt) => (
          <MenuItem key={opt} value={opt}>
            {statusLabels[opt]}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/StatusChip.tsx
git commit -m "feat(einsatzorte): add StatusChip component"
```

---

## Task 4: Create LocationMapPicker Modal

**Files:**
- Create: `src/components/Einsatzorte/LocationMapPicker.tsx`

**Step 1: Create the modal component**

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/LocationMapPicker.tsx
git commit -m "feat(einsatzorte): add LocationMapPicker modal"
```

---

## Task 5: Create Geocoding Utility

**Files:**
- Create: `src/components/Einsatzorte/geocode.ts`

**Step 1: Create geocoding helper**

```typescript
import { searchPlace } from '../actions/maps/places';
import { defaultGeoPosition } from '../../common/geo';

export async function geocodeAddress(
  street: string,
  number: string,
  city: string
): Promise<{ lat: number; lng: number } | null> {
  if (!street || !number) {
    return null;
  }

  const query = `${street} ${number}, ${city}`;

  try {
    const results = await searchPlace(query, {
      position: defaultGeoPosition,
      maxResults: 1,
    });

    if (results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
  } catch (error) {
    console.error('Geocoding failed:', error);
  }

  return null;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/geocode.ts
git commit -m "feat(einsatzorte): add geocoding utility"
```

---

## Task 6: Create EinsatzorteRow Component

**Files:**
- Create: `src/components/Einsatzorte/EinsatzorteRow.tsx`

**Step 1: Create the row component with inline editing**

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/EinsatzorteRow.tsx
git commit -m "feat(einsatzorte): add EinsatzorteRow component with auto-save"
```

---

## Task 7: Create EinsatzorteTable Component

**Files:**
- Create: `src/components/Einsatzorte/EinsatzorteTable.tsx`

**Step 1: Create the table component**

```typescript
'use client';

import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useCallback } from 'react';
import { FirecallLocation, defaultFirecallLocation } from '../firebase/firestore';
import EinsatzorteRow from './EinsatzorteRow';

interface EinsatzorteTableProps {
  locations: FirecallLocation[];
  onUpdate: (id: string, updates: Partial<FirecallLocation>) => void;
  onDelete: (id: string) => void;
  onAdd: (location: Partial<FirecallLocation>) => void;
}

export default function EinsatzorteTable({
  locations,
  onUpdate,
  onDelete,
  onAdd,
}: EinsatzorteTableProps) {
  const handleChange = useCallback(
    (id: string) => (updates: Partial<FirecallLocation>) => {
      onUpdate(id, updates);
    },
    [onUpdate]
  );

  const handleDelete = useCallback(
    (id: string) => () => {
      onDelete(id);
    },
    [onDelete]
  );

  const emptyLocation: FirecallLocation = {
    ...defaultFirecallLocation,
    created: '',
    creator: '',
  } as FirecallLocation;

  return (
    <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 200px)' }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 130 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 150 }}>Bezeichnung</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 300 }}>Adresse</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Fahrzeuge</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>Alarm</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>Start</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>Erledigt</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 160 }}>Koordinaten</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 50 }}></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {locations.map((location) => (
            <EinsatzorteRow
              key={location.id}
              location={location}
              onChange={handleChange(location.id!)}
              onDelete={handleDelete(location.id!)}
            />
          ))}
          <EinsatzorteRow
            key="new"
            location={emptyLocation}
            isNew
            onChange={() => {}}
            onAdd={onAdd}
          />
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/EinsatzorteTable.tsx
git commit -m "feat(einsatzorte): add EinsatzorteTable component"
```

---

## Task 8: Create EinsatzorteCard Component (Mobile)

**Files:**
- Create: `src/components/Einsatzorte/EinsatzorteCard.tsx`

**Step 1: Create the card component**

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Einsatzorte/EinsatzorteCard.tsx
git commit -m "feat(einsatzorte): add EinsatzorteCard component for mobile"
```

---

## Task 9: Create Einsatzorte Page

**Files:**
- Create: `src/components/pages/Einsatzorte.tsx`
- Create: `src/components/pages/EinsatzorteWrapper.tsx`
- Create: `src/app/einsatzorte/page.tsx`

**Step 1: Create the main page component**

`src/components/pages/Einsatzorte.tsx`:

```typescript
'use client';

import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useCallback, useState } from 'react';
import useFirecall from '../../hooks/useFirecall';
import useFirecallLocations from '../../hooks/useFirecallLocations';
import { FirecallLocation, defaultFirecallLocation } from '../firebase/firestore';
import EinsatzorteTable from '../Einsatzorte/EinsatzorteTable';
import EinsatzorteCard from '../Einsatzorte/EinsatzorteCard';

export default function Einsatzorte() {
  const firecall = useFirecall();
  const { locations, addLocation, updateLocation, deleteLocation } =
    useFirecallLocations();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleAdd = useCallback(
    async (location: Partial<FirecallLocation>) => {
      try {
        await addLocation(location);
      } catch (error) {
        setSnackbar('Fehler beim Hinzufügen');
        console.error('Add failed:', error);
      }
    },
    [addLocation]
  );

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<FirecallLocation>) => {
      try {
        await updateLocation(id, updates);
      } catch (error) {
        setSnackbar('Fehler beim Speichern');
        console.error('Update failed:', error);
      }
    },
    [updateLocation]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteLocation(id);
      } catch (error) {
        setSnackbar('Fehler beim Löschen');
        console.error('Delete failed:', error);
      }
    },
    [deleteLocation]
  );

  if (!firecall || firecall.id === 'unknown') {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Kein Einsatz ausgewählt</Typography>
      </Box>
    );
  }

  const emptyLocation: FirecallLocation = {
    ...defaultFirecallLocation,
    created: '',
    creator: '',
  } as FirecallLocation;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Einsatzorte - {firecall.name}
      </Typography>

      {isMobile ? (
        <Box>
          {locations.map((location) => (
            <EinsatzorteCard
              key={location.id}
              location={location}
              onChange={(updates) => handleUpdate(location.id!, updates)}
              onDelete={() => handleDelete(location.id!)}
            />
          ))}
          <EinsatzorteCard
            key="new"
            location={emptyLocation}
            isNew
            onChange={() => {}}
            onAdd={handleAdd}
          />
        </Box>
      ) : (
        <EinsatzorteTable
          locations={locations}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
      />
    </Box>
  );
}
```

**Step 2: Create the wrapper for client-side loading**

`src/components/pages/EinsatzorteWrapper.tsx`:

```typescript
'use client';

import { FunctionComponent, useEffect, useState } from 'react';

const EinsatzorteWrapper: FunctionComponent = () => {
  const [EinsatzortePage, setEinsatzortePage] = useState<FunctionComponent>();

  useEffect(() => {
    (async () => {
      if (typeof global.window !== 'undefined') {
        const pageComponent = (await import('./Einsatzorte')).default;
        setEinsatzortePage(() => pageComponent);
      }
    })();
  }, []);

  if (typeof global.window === 'undefined' || !EinsatzortePage) {
    return null;
  }

  return EinsatzortePage ? <EinsatzortePage /> : null;
};

export default EinsatzorteWrapper;
```

**Step 3: Create the App Router page**

`src/app/einsatzorte/page.tsx`:

```typescript
import type { NextPage } from 'next';
import Einsatzorte from '../../components/pages/EinsatzorteWrapper';

const EinsatzortePage: NextPage = () => {
  return <Einsatzorte />;
};

export default EinsatzortePage;
```

**Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/pages/Einsatzorte.tsx src/components/pages/EinsatzorteWrapper.tsx src/app/einsatzorte/page.tsx
git commit -m "feat(einsatzorte): add Einsatzorte page with responsive layout"
```

---

## Task 10: Add Navigation Entry

**Files:**
- Modify: `src/components/site/AppDrawer.tsx`

**Step 1: Add the Einsatzorte menu item**

Add import at the top:
```typescript
import PlaceIcon from '@mui/icons-material/Place';
```

Add the menu item in the `drawerItems` array after `Tabelle` (around line 75):
```typescript
{
  text: 'Einsatzorte',
  icon: <PlaceIcon />,
  href: '/einsatzorte',
},
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/site/AppDrawer.tsx
git commit -m "feat(einsatzorte): add navigation entry"
```

---

## Task 11: Create LocationsLayer Map Component

**Files:**
- Create: `src/components/Map/layers/LocationsLayer.tsx`

**Step 1: Create the map layer**

```typescript
'use client';

import { LayerGroup } from 'react-leaflet';
import useFirecallLocations from '../../../hooks/useFirecallLocations';
import FirecallElement from '../../FirecallItems/elements/FirecallElement';
import { FcMarker, LOCATION_STATUS_COLORS, LocationStatus } from '../../firebase/firestore';

export default function LocationsLayer() {
  const { locations } = useFirecallLocations();

  return (
    <LayerGroup>
      {locations
        .filter((loc) => loc.lat && loc.lng)
        .map((location) => (
          <FirecallElement
            item={
              {
                ...location,
                type: 'marker',
                color: LOCATION_STATUS_COLORS[location.status as LocationStatus] || 'red',
                beschreibung: [
                  `${location.street} ${location.number}, ${location.city}`,
                  location.vehicles && `Fahrzeuge: ${location.vehicles}`,
                  location.description,
                ].filter(Boolean).join('\n'),
                draggable: false,
              } as FcMarker
            }
            selectItem={() => {}}
            key={location.id}
          />
        ))}
    </LayerGroup>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Map/layers/LocationsLayer.tsx
git commit -m "feat(einsatzorte): add LocationsLayer map component"
```

---

## Task 12: Integrate LocationsLayer into Map

**Files:**
- Modify: `src/components/Map/Map.tsx` (or equivalent map container)

**Step 1: Find and examine the map container**

Search for where `UnwetterLayer` is imported and used to understand the integration point.

Run: `grep -r "UnwetterLayer" src/`
Find the file that imports and renders `UnwetterLayer`.

**Step 2: Add LocationsLayer alongside or replacing UnwetterLayer**

Import at the top:
```typescript
import LocationsLayer from './layers/LocationsLayer';
```

Add the component in the map's layer section:
```typescript
<LocationsLayer />
```

**Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Test manually**

Run: `npm run dev`
- Navigate to the map
- Verify that locations from Firestore appear as markers
- Verify colors match status

**Step 5: Commit**

```bash
git add <modified-map-file>
git commit -m "feat(einsatzorte): integrate LocationsLayer into map"
```

---

## Task 13: Manual Testing Checklist

**Test the complete feature:**

1. **Navigate to Einsatzorte tab**
   - Should show empty state with one empty row
   - Title should show firecall name

2. **Add a new location**
   - Type in the empty row
   - After 500ms of inactivity, should auto-save
   - New empty row should appear

3. **Edit existing location**
   - Change any field
   - Should auto-save after 500ms debounce

4. **Geocoding**
   - Enter street and number
   - Coordinates should auto-populate after 1 second

5. **Map picker**
   - Click the location button
   - Modal with map should open
   - Click on map to set position
   - Confirm should update coordinates

6. **Delete location**
   - Click delete button
   - Location should be removed

7. **Mobile view**
   - Resize browser to <768px
   - Should show cards instead of table

8. **Map display**
   - Navigate to main map
   - Locations should appear as colored markers
   - Popup should show location details

---

## Task 14: Cleanup UnwetterLayer (Optional)

**Files:**
- Modify: Map container to remove `UnwetterLayer` import/usage
- Keep: `src/components/Map/layers/UnwetterLayer.tsx` for reference or delete

This task is optional and can be done after confirming the new system works correctly.

**Step 1: Remove UnwetterLayer from map**

Comment out or remove the `<UnwetterLayer />` component from the map.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git commit -am "refactor(einsatzorte): remove UnwetterLayer in favor of LocationsLayer"
```
