import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { DEFAULT_VEHICLES } from '../../common/defaultKostenersatzRates';

interface VehicleQuickAddChipsProps {
  selectedNames: string[];
  existingNames: string[];
  onToggle: (vehicleName: string) => void;
}

export default function VehicleQuickAddChips({
  selectedNames,
  existingNames,
  onToggle,
}: VehicleQuickAddChipsProps) {
  const selectedSet = new Set(selectedNames);
  const existingSet = new Set(existingNames);

  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <LocalShippingIcon color="action" fontSize="small" />
        <Typography variant="subtitle2" fontWeight={500}>
          Fahrzeuge Neusiedl am See
        </Typography>
        {selectedNames.length > 0 && (
          <Chip
            label={selectedNames.length}
            size="small"
            color="primary"
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {DEFAULT_VEHICLES.map((vehicle) => {
          const isExisting = existingSet.has(vehicle.name);
          const isSelected = selectedSet.has(vehicle.name);
          const isHighlighted = isSelected || isExisting;
          return (
            <Chip
              key={vehicle.name}
              label={vehicle.name}
              onClick={() => onToggle(vehicle.name)}
              color={isHighlighted ? 'primary' : 'default'}
              variant={isHighlighted ? 'filled' : 'outlined'}
              disabled={isExisting}
              size="small"
              title={
                isExisting
                  ? `${vehicle.name} bereits im Einsatz`
                  : vehicle.description || vehicle.name
              }
            />
          );
        })}
      </Box>
    </Box>
  );
}
