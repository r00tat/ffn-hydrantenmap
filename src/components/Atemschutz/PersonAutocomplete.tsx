'use client';

import { useMemo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { sanitizePersonen } from '../../common/atemschutz';

export interface PersonAutocompleteProps {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/**
 * Ein Namensfeld mit Vorschlägen, das jede Eingabe annimmt.
 *
 * `freeSolo` ist der Kern: Am Sammelplatz stehen Auswärtige, für die es in
 * keiner Liste einen Eintrag gibt. Die Vorschläge sollen nur verhindern, dass
 * derselbe Name zweimal unterschiedlich geschrieben wird.
 *
 * Die Liste wird hier bereinigt und nicht beim Aufrufer: Der Name **ist** der
 * Schlüssel der Option, und steht er zweimal darin, warnt React („two children
 * with the same key") und kann Einträge verschlucken. Die Aufrufer setzen die
 * Vorschläge aus mehreren Quellen zusammen — Truppmitglieder, Mannschaft,
 * Personen der Gruppe —, und die überschneiden sich naturgemäß.
 */
export default function PersonAutocomplete({
  label,
  value,
  options,
  required,
  disabled,
  onChange,
}: PersonAutocompleteProps) {
  const namen = useMemo(() => sanitizePersonen(options), [options]);

  return (
    <Autocomplete
      freeSolo
      fullWidth
      disabled={disabled}
      options={namen}
      value={value}
      // Beide Handler nötig: `onInputChange` fängt das Tippen, `onChange` die
      // Auswahl aus der Liste. Nur einer von beiden ließe je einen Weg leer.
      onInputChange={(_, next) => onChange(next ?? '')}
      onChange={(_, next) => onChange(typeof next === 'string' ? next : '')}
      renderInput={(params) => (
        <TextField {...params} label={label} required={required} />
      )}
    />
  );
}
