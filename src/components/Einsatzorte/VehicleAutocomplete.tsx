'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { useCallback, useState } from 'react';

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
  const [inputValue, setInputValue] = useState('');
  const selectedSet = new Set(value);

  // Filter suggestions to show only unselected ones
  const availableSuggestions = suggestions.filter((s) => !selectedSet.has(s));

  // Handle selection change
  const handleChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string | null) => {
      if (!newValue) return;

      const trimmed = newValue.trim();
      if (!trimmed || selectedSet.has(trimmed)) return;

      const updatedValue = [...value, trimmed];
      onChange(updatedValue);

      // Check if it's a Kostenersatz vehicle
      if (onKostenersatzVehicleAdded && kostenersatzVehicleNames.has(trimmed)) {
        onKostenersatzVehicleAdded(trimmed);
      }

      // Clear the input
      setInputValue('');
    },
    [value, onChange, onKostenersatzVehicleAdded, kostenersatzVehicleNames, selectedSet]
  );

  // Remove a vehicle
  const removeVehicle = useCallback(
    (vehicleName: string) => {
      onChange(value.filter((v) => v !== vehicleName));
    },
    [value, onChange]
  );

  return (
    <Box>
      {/* Selected vehicles as chips */}
      {value.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {value.map((vehicle) => {
            const isKostenersatz = kostenersatzVehicleNames.has(vehicle);
            return (
              <Chip
                key={vehicle}
                label={vehicle}
                size="small"
                color={isKostenersatz ? 'primary' : 'default'}
                variant={isKostenersatz ? 'filled' : 'outlined'}
                onDelete={disabled ? undefined : () => removeVehicle(vehicle)}
                disabled={disabled}
              />
            );
          })}
        </Box>
      )}

      {/* Autocomplete input with suggestions dropdown */}
      <Autocomplete
        freeSolo
        options={availableSuggestions}
        inputValue={inputValue}
        onInputChange={(_event, newInputValue) => setInputValue(newInputValue)}
        onChange={handleChange}
        disabled={disabled}
        clearOnBlur={false}
        blurOnSelect
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            fullWidth
            size="small"
            placeholder="Fahrzeug hinzufügen..."
          />
        )}
      />
    </Box>
  );
}
