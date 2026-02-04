'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { useCallback, useRef } from 'react';

interface VehicleAutocompleteProps {
  value: string[];
  onChange: (vehicles: string[]) => void;
  suggestions: string[]; // Combined Kostenersatz + firecall vehicles
  kostenersatzVehicleNames: Set<string>; // To identify Kostenersatz vehicles
  disabled?: boolean;
  onKostenersatzVehicleAdded?: (vehicleName: string) => void; // Callback when a Kostenersatz vehicle is added
}

export default function VehicleAutocomplete({
  value,
  onChange,
  suggestions,
  kostenersatzVehicleNames,
  disabled = false,
  onKostenersatzVehicleAdded,
}: VehicleAutocompleteProps) {
  // Track current values to detect newly added vehicles
  const previousValuesRef = useRef<Set<string>>(new Set(value));

  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string[]) => {
      // Find newly added vehicles (in newValue but not in previous)
      const previousSet = previousValuesRef.current;
      const addedVehicles = newValue.filter((v) => !previousSet.has(v));

      // Update the ref for next comparison
      previousValuesRef.current = new Set(newValue);

      // Call onChange with the new value
      onChange(newValue);

      // Check if any added vehicle is a Kostenersatz vehicle
      if (onKostenersatzVehicleAdded) {
        for (const vehicleName of addedVehicles) {
          if (kostenersatzVehicleNames.has(vehicleName)) {
            onKostenersatzVehicleAdded(vehicleName);
          }
        }
      }
    },
    [onChange, onKostenersatzVehicleAdded, kostenersatzVehicleNames]
  );

  return (
    <Autocomplete
      multiple
      freeSolo
      options={suggestions}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      filterSelectedOptions
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => {
          const { key, ...chipProps } = getTagProps({ index });
          const isKostenersatz = kostenersatzVehicleNames.has(option);
          return (
            <Chip
              key={key}
              label={option}
              size="small"
              color={isKostenersatz ? 'primary' : 'default'}
              variant={isKostenersatz ? 'filled' : 'outlined'}
              {...chipProps}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          fullWidth
          placeholder={value.length === 0 ? 'Fahrzeuge hinzufügen...' : ''}
        />
      )}
    />
  );
}
