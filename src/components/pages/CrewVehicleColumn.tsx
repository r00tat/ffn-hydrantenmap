'use client';

import React from 'react';
import { Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
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
  /** Entfernt das Fahrzeug selbst aus dem Einsatz (nicht die Besatzung). */
  onRemoveVehicle?: (vehicleId: string) => void;
  /** Nur-Lese-Ansicht für Einsatz-Gäste ohne Schreibrecht. */
  readOnly?: boolean;
}

export default function CrewVehicleColumn({
  vehicleId,
  vehicleName,
  assignments,
  vehicles,
  onFunktionChange,
  onVehicleChange,
  onRemove,
  onRemoveVehicle,
  readOnly = false,
}: CrewVehicleColumnProps) {
  const t = useTranslations('crew');
  const { isOver, setNodeRef } = useDroppable({
    id: vehicleId || 'unassigned',
    disabled: readOnly,
  });
  // Die Spalte „Verfügbar" (vehicleId null) ist kein Fahrzeug und bleibt.
  const canRemoveVehicle = !readOnly && !!vehicleId && !!onRemoveVehicle;

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip label={String(assignments.length)} size="small" />
          {canRemoveVehicle && (
            <Tooltip
              title={t('removeVehicleTooltip', { name: vehicleName })}
            >
              <IconButton
                size="small"
                color="error"
                aria-label={t('removeVehicleTooltip', { name: vehicleName })}
                onClick={() => onRemoveVehicle(vehicleId)}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
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
            (assignment.source === 'manual' ||
              (assignment.source === undefined &&
                assignment.recipientId.startsWith('manual-'))) &&
            assignment.id
              ? () => onRemove(assignment.id!)
              : undefined
          }
          readOnly={readOnly}
        />
      ))}
    </Box>
  );
}
