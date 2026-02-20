'use client';

import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import { useCallback } from 'react';
import { FirecallLocation, defaultFirecallLocation, Fzg } from '../firebase/firestore';
import EinsatzorteRow from './EinsatzorteRow';

export type EinsatzorteSortField =
  | 'name'
  | 'address'
  | 'status'
  | 'vehicles'
  | 'alarmTime'
  | 'startTime'
  | 'doneTime'
  | 'created';

interface EinsatzorteTableProps {
  locations: FirecallLocation[];
  onUpdate: (id: string, updates: Partial<FirecallLocation>) => void;
  onDelete: (id: string) => void;
  onAdd: (location: Partial<FirecallLocation>) => void;
  mapVehicles: Fzg[];
  kostenersatzVehicleNames: Set<string>;
  onKostenersatzVehicleSelected?: (vehicleName: string, location: FirecallLocation) => void;
  onMapVehicleSelected?: (vehicleId: string, vehicleName: string, location: FirecallLocation) => void;
  sortField?: EinsatzorteSortField;
  sortDirection?: 'asc' | 'desc';
  onSortClick?: (field: EinsatzorteSortField) => void;
}

export default function EinsatzorteTable({
  locations,
  onUpdate,
  onDelete,
  onAdd,
  mapVehicles,
  kostenersatzVehicleNames,
  onKostenersatzVehicleSelected,
  onMapVehicleSelected,
  sortField = 'created',
  sortDirection = 'asc',
  onSortClick,
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
            <TableCell sx={{ fontWeight: 'bold', minWidth: 150 }}>
              <TableSortLabel
                active={sortField === 'name'}
                direction={sortField === 'name' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('name')}
              >
                Bezeichnung
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 350 }}>
              <TableSortLabel
                active={sortField === 'address'}
                direction={sortField === 'address' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('address')}
              >
                Adresse
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>
              <TableSortLabel
                active={sortField === 'status'}
                direction={sortField === 'status' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('status')}
              >
                Status
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>
              <TableSortLabel
                active={sortField === 'vehicles'}
                direction={sortField === 'vehicles' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('vehicles')}
              >
                Fahrzeuge
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>Beschreibung</TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>
              <TableSortLabel
                active={sortField === 'alarmTime'}
                direction={sortField === 'alarmTime' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('alarmTime')}
              >
                Alarm
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>
              <TableSortLabel
                active={sortField === 'startTime'}
                direction={sortField === 'startTime' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('startTime')}
              >
                Start
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>
              <TableSortLabel
                active={sortField === 'doneTime'}
                direction={sortField === 'doneTime' ? sortDirection : 'asc'}
                onClick={() => onSortClick?.('doneTime')}
              >
                Erledigt
              </TableSortLabel>
            </TableCell>
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
              mapVehicles={mapVehicles}
              kostenersatzVehicleNames={kostenersatzVehicleNames}
              onKostenersatzVehicleSelected={onKostenersatzVehicleSelected}
              onMapVehicleSelected={onMapVehicleSelected}
            />
          ))}
          <EinsatzorteRow
            key="new"
            location={emptyLocation}
            isNew
            onChange={() => {}}
            onAdd={onAdd}
            mapVehicles={mapVehicles}
            kostenersatzVehicleNames={kostenersatzVehicleNames}
            onKostenersatzVehicleSelected={onKostenersatzVehicleSelected}
            onMapVehicleSelected={onMapVehicleSelected}
          />
        </TableBody>
      </Table>
    </TableContainer>
  );
}
