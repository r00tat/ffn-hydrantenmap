import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
} from '@mui/material';
import { Firecall } from '@shared/types';

interface FirecallSelectProps {
  firecalls: Firecall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

export default function FirecallSelect({
  firecalls,
  selectedId,
  onSelect,
  loading,
}: FirecallSelectProps) {
  if (loading) {
    return <Skeleton variant="rectangular" height={56} />;
  }

  return (
    <FormControl fullWidth size="small">
      <InputLabel>Einsatz</InputLabel>
      <Select
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
        label="Einsatz"
      >
        {firecalls.map((fc) => (
          <MenuItem key={fc.id} value={fc.id}>
            {fc.name} — {fc.date ? new Date(fc.date).toLocaleDateString('de-AT') : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
