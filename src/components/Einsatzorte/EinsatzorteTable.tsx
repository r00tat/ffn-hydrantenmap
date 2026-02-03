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
