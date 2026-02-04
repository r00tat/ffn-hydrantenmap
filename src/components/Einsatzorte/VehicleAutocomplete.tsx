'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
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

  // Add a vehicle (either from suggestions or custom text)
  const addVehicle = useCallback(
    (vehicleName: string) => {
      const trimmed = vehicleName.trim();
      if (!trimmed || selectedSet.has(trimmed)) return;

      const newValue = [...value, trimmed];
      onChange(newValue);

      // Check if it's a Kostenersatz vehicle
      if (onKostenersatzVehicleAdded && kostenersatzVehicleNames.has(trimmed)) {
        onKostenersatzVehicleAdded(trimmed);
      }
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

  // Handle text input submission
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault();
        addVehicle(inputValue);
        setInputValue('');
      }
    },
    [inputValue, addVehicle]
  );

  const handleAddClick = useCallback(() => {
    if (inputValue.trim()) {
      addVehicle(inputValue);
      setInputValue('');
    }
  }, [inputValue, addVehicle]);

  // Filter suggestions to show only unselected ones
  const availableSuggestions = suggestions.filter((s) => !selectedSet.has(s));

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

      {/* Text input for custom vehicles */}
      <TextField
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleInputKeyDown}
        variant="standard"
        fullWidth
        size="small"
        placeholder="Fahrzeug hinzufügen..."
        disabled={disabled}
        InputProps={{
          endAdornment: inputValue.trim() ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleAddClick} disabled={disabled}>
                <AddIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      {/* Suggestion chips (unselected vehicles) */}
      {availableSuggestions.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {availableSuggestions.map((vehicle) => {
            const isKostenersatz = kostenersatzVehicleNames.has(vehicle);
            return (
              <Chip
                key={vehicle}
                label={vehicle}
                size="small"
                color={isKostenersatz ? 'primary' : 'default'}
                variant="outlined"
                onClick={disabled ? undefined : () => addVehicle(vehicle)}
                disabled={disabled}
                sx={{ cursor: disabled ? 'default' : 'pointer' }}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}
