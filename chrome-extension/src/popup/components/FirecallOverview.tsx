import { Box, Typography, Chip, Skeleton, Divider } from '@mui/material';
import LocalFireDepartment from '@mui/icons-material/LocalFireDepartment';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import AccessTime from '@mui/icons-material/AccessTime';
import { Firecall, FirecallItem } from '@shared/types';

interface FirecallOverviewProps {
  firecall: Firecall | undefined;
  items: FirecallItem[];
  loading: boolean;
}

export default function FirecallOverview({
  firecall,
  items,
  loading,
}: FirecallOverviewProps) {
  if (loading || !firecall) {
    return <Skeleton variant="rectangular" height={200} />;
  }

  const vehicleCount = items.filter((i) => i.type === 'vehicle').length;
  const isActive = !!firecall.eintreffen && !firecall.abruecken;

  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LocalFireDepartment color="error" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          {firecall.name}
        </Typography>
        <Chip
          label={isActive ? 'Aktiv' : 'Beendet'}
          color={isActive ? 'error' : 'default'}
          size="small"
        />
      </Box>

      {firecall.description && (
        <Typography variant="body2" color="text.secondary">
          {firecall.description}
        </Typography>
      )}

      <Divider />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AccessTime fontSize="small" color="action" />
          <Typography variant="body2">
            {firecall.date
              ? new Date(firecall.date).toLocaleString('de-AT')
              : '\u2013'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <DirectionsCar fontSize="small" color="action" />
          <Typography variant="body2">
            {vehicleCount} Fahrzeug{vehicleCount !== 1 ? 'e' : ''}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
