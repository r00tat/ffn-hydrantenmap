'use client';

import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

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
 */
export default function PersonAutocomplete({
  label,
  value,
  options,
  required,
  disabled,
  onChange,
}: PersonAutocompleteProps) {
  return (
    <Autocomplete
      freeSolo
      fullWidth
      disabled={disabled}
      options={options}
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
