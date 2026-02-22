'use client';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useState } from 'react';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { parseTimestamp } from '../../common/time-format';

/**
 * Convert a date string (ISO or other supported format) to datetime-local input value (YYYY-MM-DDTHH:mm)
 */
function toDateTimeLocalValue(dateStr?: string): string {
  if (!dateStr) return '';
  const m = parseTimestamp(dateStr);
  if (!m) return '';
  return m.format('YYYY-MM-DDTHH:mm');
}

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
    calculation.nameOverride ||
    `${firecall.name}${firecall.description ? ` - ${firecall.description}` : ''}`;

  const dateValue = toDateTimeLocalValue(displayDate);

  // Start/end date values for datetime-local inputs
  const displayStartDate =
    calculation.startDateOverride || firecall.date;
  const startValue = toDateTimeLocalValue(displayStartDate);
  const displayEndDate = calculation.endDateOverride || firecall.abruecken;
  const endValue = toDateTimeLocalValue(displayEndDate);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Einsatzdaten (können überschrieben werden)
      </Typography>

      <TextField
        label="Titel"
        value={displayDescription}
        onChange={(e) => onChange('nameOverride', e.target.value)}
        fullWidth
        multiline
        rows={2}
        disabled={disabled}
        helperText={calculation.nameOverride ? 'Überschrieben' : undefined}
      />

      <TextField
        label="Einsatzdatum"
        type="datetime-local"
        value={dateValue}
        onChange={(e) => onChange('callDateOverride', e.target.value)}
        fullWidth
        disabled={disabled}
        slotProps={{ inputLabel: { shrink: true } }}
        helperText={
          calculation.callDateOverride
            ? 'Überschrieben - Original: ' +
              (firecall.date
                ? parseTimestamp(firecall.date)?.format('DD.MM.YYYY HH:mm') ||
                  'ungültig'
                : 'nicht gesetzt')
            : undefined
        }
      />

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <TextField
          label="Startzeit (Alarmierung)"
          type="datetime-local"
          value={startValue}
          onChange={(e) => onChange('startDateOverride', e.target.value)}
          fullWidth
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={
            calculation.startDateOverride
              ? 'Überschrieben - Original: ' +
                (firecall.date
                  ? parseTimestamp(firecall.date)?.format(
                      'DD.MM.YYYY HH:mm',
                    ) || 'ungültig'
                  : 'nicht gesetzt')
              : undefined
          }
        />
        <TextField
          label="Endzeit (Abrücken)"
          type="datetime-local"
          value={endValue}
          onChange={(e) => onChange('endDateOverride', e.target.value)}
          fullWidth
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={
            calculation.endDateOverride
              ? 'Überschrieben - Original: ' +
                (firecall.abruecken
                  ? parseTimestamp(firecall.abruecken)?.format(
                      'DD.MM.YYYY HH:mm',
                    ) || 'ungültig'
                  : 'nicht gesetzt')
              : undefined
          }
        />
      </Box>

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
          value={
            durationInput !== null ? durationInput : calculation.defaultStunden
          }
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

      {suggestedDuration > 1 &&
        calculation.defaultStunden !== suggestedDuration && (
          <Alert severity="info" sx={{ mt: 1 }}>
            Die Einsatzdauer ({calculation.defaultStunden}h) weicht von der
            berechneten Dauer ({suggestedDuration}h) ab.
          </Alert>
        )}
    </Box>
  );
}
