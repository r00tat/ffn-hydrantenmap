'use client';

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { sanitizePersonen } from '../../common/atemschutz';

export interface PersonChipsInputProps {
  label: string;
  value: string[];
  options: string[];
  helperText?: string;
  /** Höchstzahl der Namen; ohne Angabe unbegrenzt. */
  max?: number;
  /** Hinweistext, sobald `max` erreicht ist. */
  vollText?: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
}

/**
 * Eine Namensliste als Chips: tippen, Enter, nächster Name.
 *
 * Der Vorgänger war eine Zeile je Person mit „Person hinzufügen" darunter —
 * am Sammelplatz ein Klick zu viel je Name. Hier läuft die Eingabe in einem
 * Feld durch; die Vorschläge sorgen weiter dafür, dass derselbe Name nicht
 * zweimal unterschiedlich geschrieben wird.
 *
 * Drei Feinheiten, ohne die das Feld Eingaben verlöre:
 * - `autoSelect`: Wer den letzten Namen tippt und direkt auf „Speichern"
 *   klickt, verliert ihn sonst — MUI verwirft bei `freeSolo` den offenen Text
 *   beim Verlassen des Feldes.
 * - Komma und Strichpunkt trennen ebenfalls, weil Namenslisten oft aus einer
 *   Nachricht kopiert werden.
 * - `sanitizePersonen` läuft über jede Änderung: Dubletten und Leerzeichen
 *   entstehen beim schnellen Tippen von selbst.
 */
export default function PersonChipsInput({
  label,
  value,
  options,
  helperText,
  max,
  vollText,
  disabled,
  onChange,
}: PersonChipsInputProps) {
  const [eingabe, setEingabe] = useState('');

  const uebernehmen = (namen: string[]) => {
    const geteilt = namen.flatMap((n) => (n ?? '').split(/[,;]/));
    onChange(sanitizePersonen(geteilt, max));
  };

  const voll = max != null && value.length >= max;

  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      fullWidth
      disabled={disabled}
      // Bereits gewählte Namen verschwinden aus der Liste: Ein Vorschlag, der
      // schon als Chip dasteht, ist nur noch im Weg. Bereinigt, weil der Name
      // der Schlüssel der Option ist — zweimal darin, und React warnt („two
      // children with the same key") und kann Einträge verschlucken.
      options={
        voll
          ? []
          : sanitizePersonen(options).filter((o) => !value.includes(o))
      }
      value={value}
      inputValue={eingabe}
      onInputChange={(_, next) => setEingabe(next ?? '')}
      onChange={(_, next) => uebernehmen(next as string[])}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          // Ist die Höchstzahl erreicht, nimmt `sanitizePersonen` nichts mehr
          // an. Damit das nicht wie ein Fehler wirkt, sagt der Hinweistext,
          // warum der getippte Name nicht als Chip erscheint.
          helperText={voll ? vollText ?? helperText : helperText}
        />
      )}
    />
  );
}
