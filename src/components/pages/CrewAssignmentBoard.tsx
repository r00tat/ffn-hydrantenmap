'use client';

import React, { useCallback, useEffect } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DndContext, DragEndEvent } from '@dnd-kit/core';
import { BlaulichtSmsAlarm } from '../../app/blaulicht-sms/actions';
import useCrewAssignments from '../../hooks/useCrewAssignments';
import useVehicles from '../../hooks/useVehicles';
import { CrewFunktion } from '../firebase/firestore';
import CrewVehicleColumn from './CrewVehicleColumn';
import CrewPersonCard from './CrewPersonCard';

export interface CrewAssignmentBoardProps {
  alarm: BlaulichtSmsAlarm;
}

export default function CrewAssignmentBoard({
  alarm,
}: CrewAssignmentBoardProps) {
  const { crewAssignments, syncFromAlarm, assignVehicle, updateFunktion } =
    useCrewAssignments();
  const { vehicles } = useVehicles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Besatzung
      </Typography>

      {isMobile ? (
        <Box>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>
                Verfügbar ({unassigned.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {unassigned.map((a) => (
                  <CrewPersonCard
                    key={a.id || a.recipientId}
                    assignment={a}
                    showVehicleSelect
                    vehicles={vehicles}
                    onFunktionChange={(funktion) =>
                      handleFunktionChange(
                        a.id || a.recipientId,
                        funktion,
                      )
                    }
                    onVehicleChange={(vId, vName) =>
                      handleVehicleChange(
                        a.id || a.recipientId,
                        vId,
                        vName,
                      )
                    }
                  />
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
          {vehicles.map((v) => {
            const assigned = assignedToVehicle(v.id!);
            return (
              <Accordion key={v.id}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    {v.name} ({assigned.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                  >
                    {assigned.map((a) => (
                      <CrewPersonCard
                        key={a.id || a.recipientId}
                        assignment={a}
                        showVehicleSelect
                        vehicles={vehicles}
                        onFunktionChange={(funktion) =>
                          handleFunktionChange(
                            a.id || a.recipientId,
                            funktion,
                          )
                        }
                        onVehicleChange={(vId, vName) =>
                          handleVehicleChange(
                            a.id || a.recipientId,
                            vId,
                            vName,
                          )
                        }
                      />
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      ) : (
        <DndContext onDragEnd={handleDragEnd}>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            <CrewVehicleColumn
              vehicleId={null}
              vehicleName="Verfügbar"
              assignments={unassigned}
              vehicles={vehicles}
              onFunktionChange={handleFunktionChange}
              onVehicleChange={handleVehicleChange}
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
              />
            ))}
          </Box>
        </DndContext>
      )}
    </Box>
  );
}
