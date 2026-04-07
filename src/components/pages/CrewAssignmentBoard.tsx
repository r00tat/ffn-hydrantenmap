'use client';

import React, { useCallback, useEffect } from 'react';
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { BlaulichtSmsAlarm } from '../../app/blaulicht-sms/actions';
import useCrewAssignments from '../../hooks/useCrewAssignments';
import useVehicles from '../../hooks/useVehicles';
import {
  CrewAssignment,
  CrewFunktion,
  CREW_FUNKTIONEN,
  Fzg,
} from '../firebase/firestore';

export interface CrewAssignmentBoardProps {
  alarm: BlaulichtSmsAlarm;
}

function DroppableTableBody({
  droppableId,
  children,
}: {
  droppableId: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
  return (
    <TableBody
      ref={setNodeRef}
      sx={{
        backgroundColor: isOver ? 'action.hover' : undefined,
      }}
    >
      {children}
    </TableBody>
  );
}

function CrewRow({
  assignment,
  vehicles,
  showVehicleSelect,
  onFunktionChange,
  onVehicleChange,
  isMobile,
}: {
  assignment: CrewAssignment;
  vehicles: Fzg[];
  showVehicleSelect: boolean;
  onFunktionChange: (funktion: CrewFunktion) => void;
  onVehicleChange: (vehicleId: string | null, vehicleName: string) => void;
  isMobile: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: assignment.id || assignment.recipientId,
    });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
        position: 'relative' as const,
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
    <TableRow
      ref={setNodeRef}
      style={style}
      sx={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <TableCell sx={{ width: 32, p: 0.5 }}>
        <DragIndicatorIcon
          {...listeners}
          {...attributes}
          fontSize="small"
          sx={{
            cursor: 'grab',
            color: 'action.active',
            touchAction: 'none',
          }}
        />
      </TableCell>
      <TableCell sx={{ p: 0.5 }}>
        <Typography variant="body2" noWrap>
          {assignment.name}
        </Typography>
      </TableCell>
      <TableCell sx={{ p: 0.5 }}>
        <FormControl size="small" fullWidth>
          <Select
            value={assignment.funktion}
            onChange={handleFunktionChange}
            size="small"
            variant="standard"
            sx={{ fontSize: '0.875rem' }}
          >
            {CREW_FUNKTIONEN.map((f) => (
              <MenuItem key={f} value={f}>
                {isMobile ? funktionAbkuerzung(f) : f}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
      {showVehicleSelect && (
        <TableCell sx={{ p: 0.5 }}>
          <FormControl size="small" fullWidth>
            <Select
              value={assignment.vehicleId || ''}
              onChange={handleVehicleChange}
              size="small"
              variant="standard"
              displayEmpty
              sx={{ fontSize: '0.875rem' }}
            >
              <MenuItem value="">—</MenuItem>
              {vehicles.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </TableCell>
      )}
    </TableRow>
  );
}

function funktionAbkuerzung(funktion: CrewFunktion): string {
  const map: Record<CrewFunktion, string> = {
    Feuerwehrmann: 'FM',
    Maschinist: 'MA',
    Gruppenkommandant: 'GK',
    Atemschutzträger: 'ATS',
    Zugskommandant: 'ZK',
    Einsatzleiter: 'EL',
  };
  return map[funktion];
}

export default function CrewAssignmentBoard({
  alarm,
}: CrewAssignmentBoardProps) {
  const { crewAssignments, syncFromAlarm, assignVehicle, updateFunktion } =
    useCrewAssignments();
  const { vehicles } = useVehicles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  useEffect(() => {
    syncFromAlarm(alarm.recipients);
  }, [alarm, syncFromAlarm]);

  const unassigned = crewAssignments.filter((a) => a.vehicleId === null);
  const assignedToVehicle = useCallback(
    (vehicleId: string) =>
      crewAssignments.filter((a) => a.vehicleId === vehicleId),
    [crewAssignments],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const assignmentId = active.id as string;
      const targetVehicleId =
        over.id === 'unassigned' ? null : (over.id as string);
      const targetVehicleName = targetVehicleId
        ? vehicles.find((v) => v.id === targetVehicleId)?.name || ''
        : '';

      assignVehicle(assignmentId, targetVehicleId, targetVehicleName);
    },
    [assignVehicle, vehicles],
  );

  const handleFunktionChange = useCallback(
    (assignmentId: string, funktion: CrewFunktion) => {
      updateFunktion(assignmentId, funktion);
    },
    [updateFunktion],
  );

  const handleVehicleChange = useCallback(
    (
      assignmentId: string,
      vehicleId: string | null,
      vehicleName: string,
    ) => {
      assignVehicle(assignmentId, vehicleId, vehicleName);
    },
    [assignVehicle],
  );

  const renderRows = (assignments: CrewAssignment[]) =>
    assignments.map((a) => (
      <CrewRow
        key={a.id || a.recipientId}
        assignment={a}
        vehicles={vehicles}
        showVehicleSelect
        isMobile={isMobile}
        onFunktionChange={(funktion) =>
          handleFunktionChange(a.id || a.recipientId, funktion)
        }
        onVehicleChange={(vId, vName) =>
          handleVehicleChange(a.id || a.recipientId, vId, vName)
        }
      />
    ));

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Besatzung
      </Typography>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <TableContainer>
          <Table size="small" sx={{ tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 32, p: 0.5 }} />
                <TableCell sx={{ p: 0.5 }}>Name</TableCell>
                <TableCell sx={{ p: 0.5, minWidth: isMobile ? 60 : 140 }}>
                  Funktion
                </TableCell>
                <TableCell sx={{ p: 0.5, minWidth: isMobile ? 60 : 120 }}>
                  Fahrzeug
                </TableCell>
              </TableRow>
            </TableHead>
            {/* Unassigned section */}
            <DroppableTableBody droppableId="unassigned">
              <TableRow>
                <TableCell
                  colSpan={4}
                  sx={{ p: 0.5, backgroundColor: 'action.hover' }}
                >
                  <Typography variant="subtitle2">
                    Verfügbar ({unassigned.length})
                  </Typography>
                </TableCell>
              </TableRow>
              {renderRows(unassigned)}
            </DroppableTableBody>
            {/* Vehicle sections */}
            {vehicles.map((v) => {
              const assigned = assignedToVehicle(v.id!);
              return (
                <DroppableTableBody key={v.id} droppableId={v.id!}>
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      sx={{ p: 0.5, backgroundColor: 'action.hover' }}
                    >
                      <Typography variant="subtitle2">
                        {v.name} ({assigned.length})
                      </Typography>
                    </TableCell>
                  </TableRow>
                  {renderRows(assigned)}
                </DroppableTableBody>
              );
            })}
          </Table>
        </TableContainer>
        <DragOverlay />
      </DndContext>
    </Box>
  );
}
