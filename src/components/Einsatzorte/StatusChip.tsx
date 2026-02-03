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
