'use client';

import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { KostenersatzCalculation } from '../../common/kostenersatz';
import { Firecall } from '../firebase/firestore';
import { parseTimestamp } from '../../common/time-format';

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
  const t = useTranslations('kostenersatz.einsatzTab');
  const [durationInput, setDurationInput] = useState<string | null>(null);

  const displayDescription =
    calculation.nameOverride ??
    `${firecall.name}${firecall.description ? ` - ${firecall.description}` : ''}`;

  const displayStartDate = calculation.startDateOverride ?? firecall.date;
  const startValue = toDateTimeLocalValue(displayStartDate);
  const displayEndDate = calculation.endDateOverride ?? firecall.abruecken;
  const endValue = toDateTimeLocalValue(displayEndDate);

  const originalText = (raw: string | undefined) =>
    raw ? parseTimestamp(raw)?.format('DD.MM.YYYY HH:mm') || t('invalid') : t('notSet');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {t('header')}
      </Typography>

      <TextField
        label={t('title')}
        value={displayDescription}
        onChange={(e) => onChange('nameOverride', e.target.value)}
        fullWidth
        multiline
        rows={2}
        disabled={disabled}
        helperText={calculation.nameOverride ? t('overridden') : undefined}
      />

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <TextField
          label={t('alarmierung')}
          type="datetime-local"
          value={startValue}
          onChange={(e) => onChange('startDateOverride', e.target.value)}
          fullWidth
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={
            calculation.startDateOverride
              ? t('overriddenOriginal', { value: originalText(firecall.date) })
              : undefined
          }
        />
        <TextField
          label={t('endTime')}
          type="datetime-local"
          value={endValue}
          onChange={(e) => onChange('endDateOverride', e.target.value)}
          fullWidth
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={
            calculation.endDateOverride
              ? t('overriddenOriginal', { value: originalText(firecall.abruecken) })
              : undefined
          }
        />
      </Box>

      <TextField
        label={t('comment')}
        value={calculation.comment}
        onChange={(e) => onChange('comment', e.target.value)}
        fullWidth
        multiline
        rows={2}
        disabled={disabled}
        placeholder={t('commentPlaceholder')}
      />

      <Box sx={{ mt: 2 }}>
        <TextField
          label={t('duration')}
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
          slotProps={{ htmlInput: { min: 1, step: 0.5 } }}
          helperText={
            suggestedDuration > 1
              ? t('durationSuggestedHint', { hours: suggestedDuration })
              : t('durationDefaultHint')
          }
        />
      </Box>

      {suggestedDuration > 1 &&
        calculation.defaultStunden !== suggestedDuration && (
          <Alert severity="info" sx={{ mt: 1 }}>
            {t('durationMismatch', {
              actual: calculation.defaultStunden,
              suggested: suggestedDuration,
            })}
          </Alert>
        )}
    </Box>
  );
}
