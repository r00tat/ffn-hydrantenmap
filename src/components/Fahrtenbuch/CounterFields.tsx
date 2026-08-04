'use client';

import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import {
  counterWarnings,
  type CounterDefinition,
  type CounterReading,
} from '../../common/fahrtenbuch';

export interface CounterFieldsProps {
  definitions: CounterDefinition[];
  counters: Record<string, CounterReading>;
  /** Referenzwerte für die Warnungen — Warnungen blockieren nie das Speichern. */
  lastCounters: Record<string, number>;
  onChange: (counters: Record<string, CounterReading>) => void;
  disabled?: boolean;
}

function parseNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Rendert die Zählerfelder eines Fahrzeugs generisch aus dessen
 * Zählerdefinitionen. Kilometer sind nur ein Zähler unter vielen — ein Boot
 * ohne Kilometerzähler bekommt hier schlicht keine Kilometerfelder.
 */
export default function CounterFields({
  definitions,
  counters,
  lastCounters,
  onChange,
  disabled,
}: CounterFieldsProps) {
  const t = useTranslations('fahrtenbuch');

  if (definitions.length === 0) return null;

  const warnings = counterWarnings(definitions, counters, lastCounters);

  const update = (id: string, field: 'start' | 'end', value: string) => {
    onChange({
      ...counters,
      [id]: { ...counters[id], [field]: parseNumber(value) },
    });
  };

  return (
    <Box>
      {definitions.map((def) => {
        const label = def.labelKey
          ? t(def.labelKey as 'counters.km')
          : def.label;
        const reading = counters[def.id] ?? {};
        const warning = warnings.find((w) => w.counterId === def.id);
        const diff =
          def.mode === 'startEnd' &&
          reading.start !== undefined &&
          reading.end !== undefined
            ? reading.end - reading.start
            : undefined;
        const unitAdornment = (
          <InputAdornment position="end">{def.unit}</InputAdornment>
        );

        return (
          <Box key={def.id} sx={{ mb: 2 }}>
            {/* Bei einem einzelnen Feld trägt schon dessen Label den Zählernamen —
                eine Überschrift würde ihn nur doppeln. */}
            {def.mode === 'startEnd' && (
              <Typography variant="subtitle2" gutterBottom>
                {label}
              </Typography>
            )}
            <Grid container spacing={2}>
              {def.mode === 'startEnd' && (
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    disabled={disabled}
                    required={def.required}
                    // Sichtbar nur "Start" — der Zählername steht in der
                    // Überschrift darüber und würde am Feld auf schmalen
                    // Displays abgeschnitten. Der Screenreader bekommt ihn
                    // über das aria-label trotzdem.
                    label={t('counterStart')}
                    value={reading.start ?? ''}
                    onChange={(e) => update(def.id, 'start', e.target.value)}
                    slotProps={{
                      input: { endAdornment: unitAdornment },
                      htmlInput: {
                        'aria-label': `${label} — ${t('counterStart')}`,
                      },
                    }}
                  />
                </Grid>
              )}
              <Grid size={{ xs: def.mode === 'startEnd' ? 6 : 12 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  disabled={disabled}
                  required={def.required}
                  label={def.mode === 'startEnd' ? t('counterEnd') : label}
                  value={reading.end ?? ''}
                  onChange={(e) => update(def.id, 'end', e.target.value)}
                  slotProps={{
                    input: { endAdornment: unitAdornment },
                    ...(def.mode === 'startEnd' && {
                      htmlInput: {
                        'aria-label': `${label} — ${t('counterEnd')}`,
                      },
                    }),
                  }}
                />
              </Grid>
            </Grid>
            {diff !== undefined && (
              <FormHelperText>{`${t('counterDiff')}: ${diff} ${def.unit}`}</FormHelperText>
            )}
            {warning && (
              <FormHelperText error>
                {warning.type === 'decrease'
                  ? t('warnings.decrease', {
                      lastValue: warning.lastValue,
                      unit: def.unit,
                    })
                  : t('warnings.changed', {
                      lastValue: warning.lastValue,
                      unit: def.unit,
                    })}
              </FormHelperText>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
