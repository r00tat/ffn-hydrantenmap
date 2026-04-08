'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import {
  useCrewAssignmentActions,
  useCrewForVehicle,
} from '../../hooks/useFirecall';
import useVehicles from '../../hooks/useVehicles';
import {
  CREW_FUNKTIONEN,
  CrewFunktion,
  funktionAbkuerzung,
} from '../firebase/firestore';

export default function VehicleCrewSection({
  vehicleId,
}: {
  vehicleId: string;
}) {
  const crew = useCrewForVehicle(vehicleId);
  const { assignVehicle, updateFunktion } = useCrewAssignmentActions();
  const { vehicles } = useVehicles();

  if (!vehicleId) return null;

  const handleFunktionChange = (
    assignmentId: string,
    funktion: CrewFunktion
  ) => {
    updateFunktion(assignmentId, funktion);
  };

  const handleVehicleChange = (
    assignmentId: string,
    newVehicleId: string
  ) => {
    if (newVehicleId === '') {
      assignVehicle(assignmentId, null, '');
    } else {
      const vehicle = vehicles.find((v) => v.id === newVehicleId);
      assignVehicle(assignmentId, newVehicleId, vehicle?.name || '');
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Besatzung{crew.length > 0 ? ` (${crew.length})` : ''}
      </Typography>
      {crew.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Keine Besatzung zugeordnet
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {crew
            .filter((c) => c.id)
            .map((c) => (
              <Box
                key={c.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ minWidth: 120, flexShrink: 0 }}
                >
                  {c.name}
                </Typography>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={c.funktion}
                    onChange={(e: SelectChangeEvent) =>
                      handleFunktionChange(
                        c.id as string,
                        e.target.value as CrewFunktion
                      )
                    }
                    variant="standard"
                    sx={{ fontSize: '0.875rem' }}
                  >
                    {CREW_FUNKTIONEN.map((f) => (
                      <MenuItem key={f} value={f}>
                        {funktionAbkuerzung(f)} — {f}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={c.vehicleId || ''}
                    onChange={(e: SelectChangeEvent) =>
                      handleVehicleChange(c.id as string, e.target.value)
                    }
                    variant="standard"
                    sx={{ fontSize: '0.875rem' }}
                  >
                    <MenuItem value="">Verfügbar</MenuItem>
                    {vehicles.map((v) => (
                      <MenuItem key={v.id} value={v.id}>
                        {v.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  );
}
