'use client';

import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import { CrewAssignment, CrewFunktion, Fzg } from '../firebase/firestore';
import CrewPersonCard from './CrewPersonCard';

export interface CrewVehicleColumnProps {
  vehicleId: string | null;
  vehicleName: string;
  assignments: CrewAssignment[];
  vehicles: Fzg[];
  onFunktionChange: (
    assignmentId: string,
    funktion: CrewFunktion,
  ) => void;
  onVehicleChange: (
    assignmentId: string,
    vehicleId: string | null,
    vehicleName: string,
  ) => void;
  onRemove?: (assignmentId: string) => void;
}

export default function CrewVehicleColumn({
  vehicleId,
  vehicleName,
  assignments,
  vehicles,
  onFunktionChange,
  onVehicleChange,
  onRemove,
}: CrewVehicleColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: vehicleId || 'unassigned',
  });

  return (
    <Box
      ref={setNodeRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 220,
        minHeight: 100,
        border: 2,
        borderColor: isOver ? 'primary.main' : 'divider',
        borderRadius: 1,
        p: 1,
        gap: 1,
        bgcolor: isOver ? 'action.hover' : 'background.paper',
        transition: 'border-color 0.2s, background-color 0.2s',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
          {vehicleName}
        </Typography>
        <Chip label={String(assignments.length)} size="small" />
      </Box>
      {assignments.map((assignment) => (
        <CrewPersonCard
          key={assignment.id || assignment.recipientId}
          assignment={assignment}
          vehicles={vehicles}
          onFunktionChange={(funktion) =>
            onFunktionChange(
              assignment.id || assignment.recipientId,
              funktion,
            )
          }
          onVehicleChange={(vId, vName) =>
            onVehicleChange(
              assignment.id || assignment.recipientId,
              vId,
              vName,
            )
          }
          onRemove={
            onRemove &&
            assignment.recipientId.startsWith('manual-') &&
            assignment.id
              ? () => onRemove(assignment.id!)
              : undefined
          }
        />
      ))}
    </Box>
  );
}
