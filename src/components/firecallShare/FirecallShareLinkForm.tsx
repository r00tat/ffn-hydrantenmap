'use client';

import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import moment, { Moment } from 'moment';
import 'moment/locale/de';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { normalizeGuestName } from '../../common/firecallGuest';
import {
  expiryFromPreset,
  MAX_SHARE_LINK_DURATION_MS,
  type FirecallShareLink,
  type ShareLinkPreset,
} from '../../common/firecallShareLink';

export interface FirecallShareLinkFormValues {
  name: string;
  canWrite: boolean;
  expiresAt: number;
}

export interface FirecallShareLinkFormProps {
  /** Gesetzt beim Bearbeiten eines bestehenden Zugangs. */
  link?: FirecallShareLink;
  /**
   * Meldet gültige Werte oder `undefined`, solange die Eingabe unvollständig
   * ist. Muss beim Aufrufer mit `useCallback` stabilisiert sein.
   */
  onChange: (values: FirecallShareLinkFormValues | undefined) => void;
}

/**
 * Name, Zugriff und Gültigkeit eines Share-Links — dieselbe Maske für Anlegen
 * und Bearbeiten. Beim Anlegen steht die Gültigkeit auf einer Woche (dem
 * bisherigen festen Wert), beim Bearbeiten auf dem gespeicherten Datum.
 */
export default function FirecallShareLinkForm({
  link,
  onChange,
}: FirecallShareLinkFormProps) {
  const t = useTranslations('firecallShare');
  const format = useFormatter();
  const [name, setName] = useState(link?.name ?? '');
  const [canWrite, setCanWrite] = useState(!!link?.canWrite);
  const [preset, setPreset] = useState<ShareLinkPreset>(link ? 'custom' : '7d');
  const [customDate, setCustomDate] = useState<Moment | null>(
    link?.expiresAt ? moment(link.expiresAt) : null
  );
  const [touched, setTouched] = useState(false);

  // Referenzzeitpunkt für Presets und Validierung. Bewusst einmal pro Formular
  // bestimmt, damit „1 Woche" nicht bei jedem Tastendruck ein paar
  // Millisekunden wandert.
  const [now] = useState(() => Date.now());

  const expiresAt =
    preset === 'custom'
      ? (customDate?.valueOf() ?? undefined)
      : expiryFromPreset(preset, now);

  const expiryError =
    expiresAt === undefined || expiresAt <= now
      ? t('validityRequired')
      : expiresAt > now + MAX_SHARE_LINK_DURATION_MS
        ? t('validityMax')
        : undefined;

  const guestName = normalizeGuestName(name);
  const nameError = touched && !guestName ? t('nameRequired') : undefined;

  useEffect(() => {
    onChange(
      guestName && expiresAt !== undefined && !expiryError
        ? { name: guestName, canWrite, expiresAt }
        : undefined
    );
  }, [canWrite, expiresAt, expiryError, guestName, onChange]);

  return (
    <Stack spacing={2} sx={{ mt: 1 }}>
      <TextField
        label={t('nameLabel')}
        helperText={nameError ?? t('nameHelper')}
        error={!!nameError}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setTouched(true)}
        autoFocus
        fullWidth
        required
      />

      <FormControl>
        <FormLabel id="firecall-share-access">{t('accessLabel')}</FormLabel>
        <RadioGroup
          aria-labelledby="firecall-share-access"
          value={canWrite ? 'write' : 'read'}
          onChange={(e) => setCanWrite(e.target.value === 'write')}
        >
          <FormControlLabel
            value="read"
            control={<Radio />}
            label={
              <>
                {t('accessRead')}
                <Typography variant="body2" color="text.secondary">
                  {t('accessReadHint')}
                </Typography>
              </>
            }
          />
          <FormControlLabel
            value="write"
            control={<Radio />}
            label={
              <>
                {t('accessWrite')}
                <Typography variant="body2" color="text.secondary">
                  {t('accessWriteHint')}
                </Typography>
              </>
            }
          />
        </RadioGroup>
      </FormControl>

      <TextField
        select
        label={t('validityLabel')}
        value={preset}
        onChange={(e) => setPreset(e.target.value as ShareLinkPreset)}
        helperText={
          expiryError ??
          (expiresAt !== undefined
            ? t('validityHelper', {
                date: format.dateTime(new Date(expiresAt), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })
            : undefined)
        }
        error={!!expiryError}
        fullWidth
      >
        <MenuItem value="1d">{t('validity1d')}</MenuItem>
        <MenuItem value="7d">{t('validity7d')}</MenuItem>
        <MenuItem value="30d">{t('validity30d')}</MenuItem>
        <MenuItem value="custom">{t('validityCustom')}</MenuItem>
      </TextField>

      {preset === 'custom' && (
        <LocalizationProvider dateAdapter={AdapterMoment} adapterLocale="de-DE">
          <DateTimePicker
            label={t('validityCustomLabel')}
            value={customDate}
            onChange={setCustomDate}
            minDateTime={moment(now)}
            maxDateTime={moment(now + MAX_SHARE_LINK_DURATION_MS)}
            ampm={false}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </LocalizationProvider>
      )}
    </Stack>
  );
}
