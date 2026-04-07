'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
import CrewVehicleColumn from './CrewVehicleColumn';

export interface CrewAssignmentBoardProps {
  alarm?: BlaulichtSmsAlarm | null;
}

/* ─── Mobile: compact table components ─── */

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
      sx={{ backgroundColor: isOver ? 'action.hover' : undefined }}
    >
      {children}
    </TableBody>
  );
}

function CrewRow({
  assignment,
  vehicles,
  onFunktionChange,
  onVehicleChange,
  onRemove,
}: {
  assignment: CrewAssignment;
  vehicles: Fzg[];
  onFunktionChange: (funktion: CrewFunktion) => void;
  onVehicleChange: (vehicleId: string | null, vehicleName: string) => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: assignment.id || assignment.recipientId });

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
          sx={{ cursor: 'grab', color: 'action.active', touchAction: 'none' }}
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
                {funktionAbkuerzung(f)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
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
      {onRemove && (
        <TableCell sx={{ width: 32, p: 0.5 }}>
          <IconButton size="small" onClick={onRemove} color="error">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
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

/* ─── Main component ─── */

export default function CrewAssignmentBoard({
  alarm,
}: CrewAssignmentBoardProps) {
  const {
    crewAssignments,
    syncFromAlarm,
    addManualPerson,
    assignVehicle,
    updateFunktion,
    removeAssignment,
  } = useCrewAssignments();
  const [newPersonName, setNewPersonName] = useState('');
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

  // Only sync once per alarm ID to prevent duplicate creation
  const syncedAlarmRef = useRef<string | null>(null);
  useEffect(() => {
    if (!alarm) return;
    if (syncedAlarmRef.current === alarm.alarmId) return;
    syncedAlarmRef.current = alarm.alarmId;
    syncFromAlarm(alarm.recipients);
  }, [alarm, syncFromAlarm]);

  // Only show crew entries for recipients who actually confirmed (yes)
  // When alarm is unavailable, show all crew entries from Firestore
  const confirmedIds = useMemo(
    () =>
      alarm
        ? new Set(
            alarm.recipients
              .filter((r) => r.participation === 'yes')
              .map((r) => r.id),
          )
        : null,
    [alarm],
  );

  // Filter to confirmed recipients (if alarm available) and deduplicate
  // Always include manual entries (recipientId starts with "manual-")
  const validAssignments = useMemo(() => {
    const seen = new Set<string>();
    return crewAssignments.filter((a) => {
      const isManual = a.recipientId.startsWith('manual-');
      if (!isManual && confirmedIds && !confirmedIds.has(a.recipientId))
        return false;
      if (seen.has(a.recipientId)) return false;
      seen.add(a.recipientId);
      return true;
    });
  }, [crewAssignments, confirmedIds]);

  const unassigned = validAssignments.filter((a) => a.vehicleId === null);
  const assignedToVehicle = useCallback(
    (vehicleId: string) =>
      validAssignments.filter((a) => a.vehicleId === vehicleId),
    [validAssignments],
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
        onFunktionChange={(funktion) =>
          handleFunktionChange(a.id || a.recipientId, funktion)
        }
        onVehicleChange={(vId, vName) =>
          handleVehicleChange(a.id || a.recipientId, vId, vName)
        }
        onRemove={
          a.recipientId.startsWith('manual-') && a.id
            ? () => removeAssignment(a.id!)
            : undefined
        }
      />
    ));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h5">Besatzung</Typography>
        <TextField
          size="small"
          placeholder="Person hinzufügen"
          value={newPersonName}
          onChange={(e) => setNewPersonName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newPersonName.trim()) {
              addManualPerson(newPersonName);
              setNewPersonName('');
            }
          }}
          sx={{ ml: 'auto', maxWidth: 220 }}
        />
        <Tooltip title="Person hinzufügen">
          <span>
            <IconButton
              color="primary"
              disabled={!newPersonName.trim()}
              onClick={() => {
                addManualPerson(newPersonName);
                setNewPersonName('');
              }}
            >
              <AddIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {isMobile ? (
          /* ─── Mobile: compact table ─── */
          <TableContainer>
            <Table size="small" sx={{ tableLayout: 'auto' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 32, p: 0.5 }} />
                  <TableCell sx={{ p: 0.5 }}>Name</TableCell>
                  <TableCell sx={{ p: 0.5, minWidth: 60 }}>Funktion</TableCell>
                  <TableCell sx={{ p: 0.5, minWidth: 60 }}>Fahrzeug</TableCell>
                </TableRow>
              </TableHead>
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
        ) : (
          /* ─── Desktop: Kanban columns ─── */
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            <CrewVehicleColumn
              vehicleId={null}
              vehicleName="Verfügbar"
              assignments={unassigned}
              vehicles={vehicles}
              onFunktionChange={handleFunktionChange}
              onVehicleChange={handleVehicleChange}
              onRemove={removeAssignment}
            />
            {vehicles.map((v) => (
              <CrewVehicleColumn
                key={v.id}
                vehicleId={v.id!}
                vehicleName={v.name}
                assignments={assignedToVehicle(v.id!)}
                vehicles={vehicles}
                onFunktionChange={handleFunktionChange}
                onVehicleChange={handleVehicleChange}
                onRemove={removeAssignment}
              />
            ))}
          </Box>
        )}
        <DragOverlay />
      </DndContext>
    </Box>
  );
}
