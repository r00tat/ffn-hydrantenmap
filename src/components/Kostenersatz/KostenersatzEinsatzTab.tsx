'use client';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useState } from 'react';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { formatTimestamp, parseTimestamp } from '../../common/time-format';

export interface KostenersatzEinsatzTabProps {
  firecall: Firecall;
  calculation: KostenersatzCalculation;
  suggestedDuration: number;
  onChange: (field: string, value: string | number) => void;
  onDefaultStundenChange: (stunden: number) => void;
  disabled?: boolean;
}

export default function KostenersatzEinsatzTab({
  firecall,
  calculation,
  suggestedDuration,
  onChange,
  onDefaultStundenChange,
  disabled = false,
}: KostenersatzEinsatzTabProps) {
  // Local state for duration input to allow intermediate editing states (null = not editing)
  const [durationInput, setDurationInput] = useState<string | null>(null);

  // Use override values if set, otherwise fall back to firecall data
  const displayDate = calculation.callDateOverride || firecall.date;
  const displayDescription =
    calculation.callDescriptionOverride ||
    `${firecall.name}${firecall.description ? ` - ${firecall.description}` : ''}`;

  const parsedDate = displayDate ? parseTimestamp(displayDate) : undefined;
  const formattedDate = parsedDate
    ? formatTimestamp(parsedDate.toDate())
    : '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Einsatzdaten aus Firecall (können überschrieben werden)
      </Typography>

      <TextField
        label="Einsatzdatum"
        value={formattedDate}
        onChange={(e) => onChange('callDateOverride', e.target.value)}
        fullWidth
        disabled={disabled}
        helperText={
          calculation.callDateOverride
            ? 'Überschrieben - Original: ' + (firecall.date ? (parseTimestamp(firecall.date)?.format('DD.MM.YYYY HH:mm') || 'ungültig') : 'nicht gesetzt')
            : undefined
        }
      />

      <TextField
        label="Einsatzbeschreibung"
        value={displayDescription}
        onChange={(e) => onChange('callDescriptionOverride', e.target.value)}
        fullWidth
        multiline
        rows={2}
        disabled={disabled}
        helperText={
          calculation.callDescriptionOverride
            ? 'Überschrieben'
            : undefined
        }
      />

      <TextField
        label="Kommentar"
        value={calculation.comment}
        onChange={(e) => onChange('comment', e.target.value)}
        fullWidth
        multiline
        rows={2}
        disabled={disabled}
        placeholder="Zusätzliche Anmerkungen zur Berechnung..."
      />

      <Box sx={{ mt: 2 }}>
        <TextField
          label="Einsatzdauer in Stunden"
          type="number"
          value={durationInput !== null ? durationInput : calculation.defaultStunden}
          onChange={(e) => {
            setDurationInput(e.target.value);
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value > 0) {
              onDefaultStundenChange(value);
            }
          }}
          onFocus={() => {
            setDurationInput(String(calculation.defaultStunden));
          }}
          onBlur={() => {
            setDurationInput(null);
          }}
          fullWidth
          disabled={disabled}
          inputProps={{ min: 1, step: 0.5 }}
          helperText={
            suggestedDuration > 1
              ? `Vorgeschlagen basierend auf Alarmierung/Abrücken: ${suggestedDuration} Stunden. Halbe Stunden erlaubt (z.B. 2.5)`
              : 'Wird als Standard für alle Positionen verwendet. Halbe Stunden erlaubt (z.B. 2.5)'
          }
        />
      </Box>

      {suggestedDuration > 1 && calculation.defaultStunden !== suggestedDuration && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Die Einsatzdauer ({calculation.defaultStunden}h) weicht von der berechneten Dauer ({suggestedDuration}h) ab.
        </Alert>
      )}
    </Box>
  );
}
