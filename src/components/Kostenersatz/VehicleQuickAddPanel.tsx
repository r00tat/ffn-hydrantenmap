'use client';

import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { KostenersatzVehicle } from '../../common/kostenersatz';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';

interface VehicleQuickAddPanelProps {
  selectedVehicleIds: string[];
  onToggleVehicle: (vehicle: KostenersatzVehicle) => void;
  disabled?: boolean;
}

export default function VehicleQuickAddPanel({
  selectedVehicleIds,
  onToggleVehicle,
  disabled = false,
}: VehicleQuickAddPanelProps) {
  const { vehicles, loading } = useKostenersatzVehicles();

  if (loading || vehicles.length === 0) {
    return null;
  }

  const selectedSet = new Set(selectedVehicleIds);

  return (
    <Accordion defaultExpanded sx={{ mb: 1 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LocalShippingIcon color="action" />
          <Typography variant="subtitle1" fontWeight={500}>
            Unsere Fahrzeuge
          </Typography>
          {selectedVehicleIds.length > 0 && (
            <Chip
              label={selectedVehicleIds.length}
              size="small"
              color="primary"
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {vehicles.map((vehicle) => {
            const isSelected = selectedSet.has(vehicle.id);
            return (
              <Chip
                key={vehicle.id}
                label={vehicle.name}
                onClick={() => onToggleVehicle(vehicle)}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                disabled={disabled}
                title={vehicle.description || vehicle.name}
              />
            );
          })}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
