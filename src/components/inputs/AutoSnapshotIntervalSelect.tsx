import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';

const INTERVAL_OPTIONS = [
  { value: 0, label: 'Aus' },
  { value: 1, label: '1 Minute' },
  { value: 5, label: '5 Minuten' },
  { value: 10, label: '10 Minuten' },
  { value: 15, label: '15 Minuten' },
  { value: 30, label: '30 Minuten' },
];

const DEFAULT_INTERVAL = 5;

interface AutoSnapshotIntervalSelectProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

export default function AutoSnapshotIntervalSelect({
  value,
  onChange,
}: AutoSnapshotIntervalSelectProps) {
  const handleChange = (event: SelectChangeEvent<number>) => {
    onChange(Number(event.target.value));
  };

  return (
    <FormControl fullWidth variant="standard">
      <InputLabel id="auto-snapshot-interval-label">
        Auto-Snapshot Intervall
      </InputLabel>
      <Select
        labelId="auto-snapshot-interval-label"
        id="auto-snapshot-interval"
        value={value ?? DEFAULT_INTERVAL}
        label="Auto-Snapshot Intervall"
        onChange={handleChange}
      >
        {INTERVAL_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
