'use client';

import { useMemo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  geraetLabel,
  matchGeraete,
  type AtemschutzGeraet,
} from '../../common/atemschutz';

export interface GeraetAutocompleteProps {
  label: string;
  /** Der getippte Text — auch ein Wert, zu dem es kein Gerät gibt. */
  value: string;
  geraete: AtemschutzGeraet[];
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Freitext, ohne dass ein Gerät gewählt wurde. */
  onTextChange: (value: string) => void;
  /** Ein Gerät aus der Liste wurde gewählt. */
  onGeraetChange: (geraet: AtemschutzGeraet) => void;
  /**
   * Enter auf einer freien Eingabe.
   *
   * `vorschlaege` sind die gerade angezeigten Treffer. Sie gehen mit, weil ein
   * externer Handscanner den Code eintippt und ein Enter hinterherschickt —
   * der Aufrufer entscheidet dann, ob er den obersten Vorschlag übernimmt oder
   * den rohen Code weiterreicht. MUI selbst tut das bei `freeSolo` bewusst
   * nicht: Dort gewinnt der getippte Text immer gegen eine automatische
   * Vorauswahl, sonst ließe sich kein freier Wert mehr eingeben.
   */
  onSubmit?: (value: string, vorschlaege: AtemschutzGeraet[]) => void;
}

export default function GeraetAutocomplete({
  label,
  value,
  geraete,
  helperText,
  required,
  disabled,
  autoFocus,
  onTextChange,
  onGeraetChange,
  onSubmit,
}: GeraetAutocompleteProps) {
  // Die Vorschläge werden hier berechnet und nicht MUI überlassen: Dessen
  // Standardfilter sieht nur den Anzeigetext, also weder Seriennummer noch
  // Feuerwehr. `filterOptions={(o) => o}` schaltet ihn ab.
  const options = useMemo(
    () => matchGeraete(geraete, value),
    [geraete, value],
  );

  return (
    <Autocomplete
      freeSolo
      fullWidth
      disabled={disabled}
      options={options}
      filterOptions={(o) => o}
      inputValue={value}
      // `value={null}`: Das Feld führt seinen Text selbst. Gäbe man ein Gerät
      // als Wert vor, überschriebe MUI jede freie Eingabe mit dessen Etikett —
      // und eine Fremdflasche ohne Stammdatensatz wäre nicht eintragbar.
      value={null}
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : geraetLabel(option)
      }
      // Mit `freeSolo` ist eine Option `string | AtemschutzGeraet`; ein
      // getippter Text ist nie gleich einem Gerät.
      isOptionEqualToValue={(option, selected) =>
        typeof option !== 'string' &&
        typeof selected !== 'string' &&
        option.id === selected.id
      }
      onInputChange={(_, next, reason) => {
        // 'reset' feuert auch, wenn MUI das Feld nach einer Auswahl leert —
        // dabei darf der vom Aufrufer gesetzte Text nicht verloren gehen.
        if (reason !== 'reset') onTextChange(next ?? '');
      }}
      onChange={(_, next) => {
        if (next && typeof next !== 'string') onGeraetChange(next);
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <Box>
            <Typography variant="body2">{geraetLabel(option)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {[option.feuerwehr, option.inventarNr, option.seriennummer]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          autoFocus={autoFocus}
          helperText={helperText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit && value.trim()) {
              onSubmit(value.trim(), options);
            }
          }}
        />
      )}
    />
  );
}
