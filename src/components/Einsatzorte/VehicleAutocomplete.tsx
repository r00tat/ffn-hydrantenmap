'use client';

import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  einsatzmittelKategorie,
  formatBesatzung,
  parseBesatzung,
} from '../../common/vehicle-utils';
import { AssignableUnit, TACTICAL_UNIT_LABELS } from '../firebase/firestore';

function unitCaption(unit: AssignableUnit): string | undefined {
  if (unit.type !== 'tacticalUnit') return undefined;
  return unit.unitType ? TACTICAL_UNIT_LABELS[unit.unitType] : 'Einheit';
}

/** Die Stärke, wie sie am Element gepflegt ist — leer, wenn nichts erfasst ist. */
function unitStrength(unit: AssignableUnit): string | undefined {
  if (unit.type === 'tacticalUnit') {
    return unit.mann ? String(unit.mann) : undefined;
  }
  const besatzung = parseBesatzung(unit.besatzung);
  if (besatzung <= 0) return undefined;
  return formatBesatzung(besatzung, einsatzmittelKategorie(unit)) || undefined;
}

/**
 * Was der Chip am Einsatzort beim Überfahren zeigt. Der Chip selbst trägt nur
 * die Bezeichnung — bei mehreren Feuerwehren mit einem „RLF" ist erst hier zu
 * sehen, welches gemeint ist.
 */
function UnitDetails({ unit }: { unit: AssignableUnit }) {
  const t = useTranslations('einsatzorte');
  const caption = unitCaption(unit);
  const strength = unitStrength(unit);
  const fuehrung = unit.type === 'tacticalUnit' ? unit.fuehrung : undefined;
  return (
    <Box>
      <Typography variant="body2" component="div" sx={{ fontWeight: 'bold' }}>
        {unit.name}
      </Typography>
      {unit.fw && <div>{unit.fw}</div>}
      {caption && <div>{caption}</div>}
      {strength && <div>{t('unitStrength', { value: strength })}</div>}
      {fuehrung && <div>{t('unitLead', { value: fuehrung })}</div>}
      {unit.beschreibung && <div>{unit.beschreibung}</div>}
    </Box>
  );
}

interface VehicleAutocompleteProps {
  /** Current vehicles as Record<id, name> */
  value: Record<string, string>;
  /** Called when vehicles change */
  onChange: (vehicles: Record<string, string>) => void;
  /** Map vehicles and tactical units (items with IDs) */
  mapVehicles: AssignableUnit[];
  /** Kostenersatz vehicle names (not yet on map) */
  kostenersatzVehicleNames: Set<string>;
  disabled?: boolean;
  /** Called when a Kostenersatz vehicle is selected (needs to be added to map first) */
  onKostenersatzVehicleSelected?: (vehicleName: string) => void;
  /** Called when an existing map vehicle is selected */
  onMapVehicleSelected?: (vehicleId: string, vehicleName: string) => void;
  /** Called when user creates a new vehicle from typed input */
  onCreateVehicle?: (name: string, fw: string) => void;
}

type SuggestionOption = {
  type: 'map';
  vehicle: AssignableUnit;
} | {
  type: 'kostenersatz';
  name: string;
} | {
  type: 'create';
  inputValue: string;
};

export default function VehicleAutocomplete({
  value,
  onChange,
  mapVehicles,
  kostenersatzVehicleNames,
  disabled = false,
  onKostenersatzVehicleSelected,
  onMapVehicleSelected,
  onCreateVehicle,
}: VehicleAutocompleteProps) {
  const t = useTranslations('einsatzorte');
  const [inputValue, setInputValue] = useState('');

  // Build suggestion options, excluding already-selected vehicles
  const options = useMemo((): SuggestionOption[] => {
    const selectedIds = new Set(Object.keys(value));
    const selectedNames = new Set(Object.values(value).map((n) => n.toLowerCase()));

    const result: SuggestionOption[] = [];

    // Add map vehicles (not already selected)
    for (const vehicle of mapVehicles) {
      if (vehicle.id && !selectedIds.has(vehicle.id)) {
        result.push({ type: 'map', vehicle });
      }
    }

    // Add Kostenersatz vehicles (not already on map and not selected by name)
    for (const name of kostenersatzVehicleNames) {
      if (!selectedNames.has(name.toLowerCase())) {
        result.push({ type: 'kostenersatz', name });
      }
    }

    // Sort alphabetically by display name
    result.sort((a, b) => {
      const nameA = a.type === 'map' ? a.vehicle.name : a.type === 'kostenersatz' ? a.name : a.inputValue;
      const nameB = b.type === 'map' ? b.vehicle.name : b.type === 'kostenersatz' ? b.name : b.inputValue;
      return nameA.localeCompare(nameB, 'de', { sensitivity: 'base' });
    });

    return result;
  }, [mapVehicles, kostenersatzVehicleNames, value]);

  const filterOptions = useCallback(
    (options: SuggestionOption[], state: { inputValue: string }): SuggestionOption[] => {
      const input = state.inputValue.trim();
      if (!input) return options;

      const inputLower = input.toLowerCase();

      // Filter options that match the input
      const filtered = options.filter((option) => {
        const label = option.type === 'map' ? option.vehicle.name : option.type === 'kostenersatz' ? option.name : '';
        return label.toLowerCase().includes(inputLower);
      });

      // Check if any option is an exact match
      const hasExactMatch = options.some((option) => {
        const label = option.type === 'map' ? option.vehicle.name : option.type === 'kostenersatz' ? option.name : '';
        return label.toLowerCase() === inputLower;
      });

      // Append create option if no exact match
      if (!hasExactMatch && onCreateVehicle) {
        filtered.push({ type: 'create', inputValue: input });
      }

      return filtered;
    },
    [onCreateVehicle]
  );

  // Get display name for an option
  const getOptionLabel = useCallback((option: SuggestionOption): string => {
    if (option.type === 'create') return option.inputValue;
    return option.type === 'map' ? option.vehicle.name : option.name;
  }, []);

  // Handle selection
  const handleChange = useCallback(
    (_event: React.SyntheticEvent, option: SuggestionOption | null) => {
      if (!option) return;

      if (option.type === 'map') {
        // Map vehicle: add ID -> name mapping
        const vehicle = option.vehicle;
        if (vehicle.id) {
          if (onMapVehicleSelected) {
            onMapVehicleSelected(vehicle.id, vehicle.name);
          } else {
            onChange({ ...value, [vehicle.id]: vehicle.name });
          }
        }
      } else if (option.type === 'kostenersatz') {
        // Kostenersatz vehicle: trigger callback to add to map first
        onKostenersatzVehicleSelected?.(option.name);
      } else if (option.type === 'create') {
        // Split input: first word = name, rest = fw
        const parts = option.inputValue.split(/\s+/);
        const name = parts[0];
        const fw = parts.slice(1).join(' ');
        onCreateVehicle?.(name, fw);
      }

      setInputValue('');
    },
    [value, onChange, onKostenersatzVehicleSelected, onMapVehicleSelected, onCreateVehicle]
  );

  // Remove a vehicle by ID
  const removeVehicle = useCallback(
    (vehicleId: string) => {
      const updated = { ...value };
      delete updated[vehicleId];
      onChange(updated);
    },
    [value, onChange]
  );

  // Convert value Record to array for display. Der gespeicherte Name ist nur
  // eine Momentaufnahme der Zuordnung — angezeigt wird das aktuelle Element,
  // damit eine Umbenennung auch am Einsatzort ankommt.
  const selectedVehicles = useMemo(
    () =>
      Object.entries(value).map(([id, storedName]) => {
        const unit = mapVehicles.find((v) => v.id === id);
        return { id, name: unit?.name || storedName, unit };
      }),
    [value, mapVehicles]
  );

  return (
    <Box>
      {/* Selected vehicles as chips */}
      {selectedVehicles.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {selectedVehicles.map(({ id, name, unit }) => {
            const chip = (
              <Chip
                key={id}
                label={name}
                size="small"
                variant="outlined"
                onDelete={disabled ? undefined : () => removeVehicle(id)}
                disabled={disabled}
              />
            );
            if (!unit) return chip;
            // Ein deaktivierter Chip feuert keine Events — der Tooltip
            // braucht deshalb den span-Wrapper (siehe CLAUDE.md).
            return (
              <Tooltip key={id} title={<UnitDetails unit={unit} />}>
                <span>{chip}</span>
              </Tooltip>
            );
          })}
        </Box>
      )}

      {/* Autocomplete input */}
      <Autocomplete
        options={options}
        getOptionLabel={getOptionLabel}
        value={null}
        inputValue={inputValue}
        onInputChange={(_event, newInputValue, reason) => {
          if (reason !== 'reset') {
            setInputValue(newInputValue);
          }
        }}
        onChange={handleChange}
        disabled={disabled}
        clearOnBlur={false}
        autoHighlight
        filterOptions={filterOptions}
        blurOnSelect
        isOptionEqualToValue={(option, val) => {
          if (option.type === 'map' && val.type === 'map') {
            return option.vehicle.id === val.vehicle.id;
          }
          if (option.type === 'kostenersatz' && val.type === 'kostenersatz') {
            return option.name === val.name;
          }
          if (option.type === 'create' && val.type === 'create') {
            return option.inputValue === val.inputValue;
          }
          return false;
        }}
        renderOption={(props, option) => {
          if (option.type === 'create') {
            return (
              <Box component="li" {...props} key="__create__">
                <Typography color="primary">+ Neu: {option.inputValue}</Typography>
              </Box>
            );
          }

          const name = option.type === 'map' ? option.vehicle.name : option.name;
          const fw = option.type === 'map' ? option.vehicle.fw : undefined;
          const isKostenersatz = option.type === 'kostenersatz';
          const caption =
            option.type === 'map' ? unitCaption(option.vehicle) : undefined;

          return (
            <Box component="li" {...props} key={option.type === 'map' ? option.vehicle.id : option.name}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{name}</span>
                <Box sx={{ display: 'flex', gap: 1, ml: 1 }}>
                  {fw && (
                    <Typography variant="caption" color="text.secondary">
                      {fw}
                    </Typography>
                  )}
                  {caption && (
                    <Typography variant="caption" color="text.secondary">
                      {caption}
                    </Typography>
                  )}
                  {isKostenersatz && (
                    <Typography variant="caption" color="primary">
                      + Karte
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="standard"
            fullWidth
            size="small"
            placeholder={t('addVehicle')}
          />
        )}
      />
    </Box>
  );
}
