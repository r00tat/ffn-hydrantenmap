'use client';

import React from 'react';
import {
  Card,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from '@mui/material';
import { useDraggable } from '@dnd-kit/core';
import {
  CrewAssignment,
  CrewFunktion,
  CREW_FUNKTIONEN,
  Fzg,
} from '../firebase/firestore';

export interface CrewPersonCardProps {
  assignment: CrewAssignment;
  vehicles: Fzg[];
  onFunktionChange: (funktion: CrewFunktion) => void;
  onVehicleChange: (vehicleId: string | null, vehicleName: string) => void;
  showVehicleSelect?: boolean;
}

export default function CrewPersonCard({
  assignment,
  vehicles,
  onFunktionChange,
  onVehicleChange,
  showVehicleSelect = false,
}: CrewPersonCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: assignment.id || assignment.recipientId,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const handleFunktionChange = (event: SelectChangeEvent) => {
    onFunktionChange(event.target.value as CrewFunktion);
  };

  const handleVehicleChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    if (value === '') {
      onVehicleChange(null, '');
    } else {
      const vehicle = vehicles.find((v) => v.id === value);
      onVehicleChange(value, vehicle?.name || '');
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        cursor: 'grab',
      }}
    >
      <Typography variant="body2" sx={{ flexShrink: 0 }}>
        {assignment.name}
      </Typography>
      <FormControl size="small" sx={{ minWidth: 140, ml: 'auto' }}>
        <Select
          value={assignment.funktion}
          onChange={handleFunktionChange}
          size="small"
          data-testid="funktion-select"
        >
          {CREW_FUNKTIONEN.map((f) => (
            <MenuItem key={f} value={f}>
              {f}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {showVehicleSelect && (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <Select
            value={assignment.vehicleId || ''}
            onChange={handleVehicleChange}
            size="small"
            data-testid="vehicle-select"
          >
            <MenuItem value="">-- Nicht zugeordnet --</MenuItem>
            {vehicles.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Card>
  );
}
