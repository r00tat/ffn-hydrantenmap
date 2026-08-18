'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CancelIcon from '@mui/icons-material/Cancel';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useTranslations } from 'next-intl';
import { useKostenersatzVehicles } from '../../hooks/useKostenersatzVehicles';

interface VehicleQuickAddChipsProps {
  selectedNames: string[];
  existingNames: string[];
  onToggle: (vehicleName: string) => void;
  /**
   * Wenn gesetzt, lassen sich bereits im Einsatz befindliche Fahrzeuge über das
   * X am Chip wieder entfernen. Ohne diesen Handler bleibt der Chip — wie im
   * Anlage-Dialog — deaktiviert, dort gibt es nichts zu entfernen.
   */
  onRemove?: (vehicleName: string) => void;
}

export default function VehicleQuickAddChips({
  selectedNames,
  existingNames,
  onToggle,
  onRemove,
}: VehicleQuickAddChipsProps) {
  const t = useTranslations('firecallItem');
  // Die Fahrzeugliste kommt aus derselben Quelle wie der Kostenersatz.
  // `DEFAULT_VEHICLES` war eine zweite Wahrheit und schon veraltet: Dort heißt
  // das Boot „MZB", in Firestore und in den Fahrtenbuch-Stammdaten
  // „Mehrzweckboot" — und ein so benanntes Karten-Item fand der Namensabgleich
  // der Sammelerfassung nicht.
  const { vehicles } = useKostenersatzVehicles();
  const selectedSet = new Set(selectedNames);
  const existingSet = new Set(existingNames);

  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <LocalShippingIcon color="action" fontSize="small" />
        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
          {t('quickAddVehiclesTitle')}
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
        {vehicles.map((vehicle) => {
          const isExisting = existingSet.has(vehicle.name);
          const isSelected = selectedSet.has(vehicle.name);
          const isHighlighted = isSelected || isExisting;
          const removable = isExisting && onRemove !== undefined;
          const removeLabel = t('quickAddRemove', { name: vehicle.name });
          return (
            <Chip
              key={vehicle.id}
              label={vehicle.name}
              // Ein bereits vorhandenes Fahrzeug kein zweites Mal anlegen: der
              // Chip-Körper reagiert dann nicht, entfernt wird über das X.
              onClick={
                isExisting ? undefined : () => onToggle(vehicle.name)
              }
              onDelete={removable ? () => onRemove(vehicle.name) : undefined}
              deleteIcon={
                removable ? <CancelIcon aria-label={removeLabel} /> : undefined
              }
              color={isHighlighted ? 'primary' : 'default'}
              variant={isHighlighted ? 'filled' : 'outlined'}
              disabled={isExisting && !removable}
              size="small"
              title={
                removable
                  ? removeLabel
                  : isExisting
                    ? t('quickAddAlreadyAdded', { name: vehicle.name })
                    : vehicle.description || vehicle.name
              }
            />
          );
        })}
      </Box>
    </Box>
  );
}
