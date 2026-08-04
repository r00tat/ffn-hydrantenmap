'use client';

import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useTranslations } from 'next-intl';
import { FAHRT_ZWECKE, type FahrtZweck } from '../../common/fahrtenbuch';
import CounterFields from './CounterFields';
import {
  fromLocalInput,
  toLocalInput,
  type EntryFormPerson,
  type EntryFormState,
} from './useEntryFormState';

export interface FahrtenbuchEntryFieldsProps {
  form: EntryFormState;
  persons: EntryFormPerson[];
}

/**
 * Die Felder einer Fahrt — rein darstellend. Zustand und Validierung liegen in
 * `useEntryFormState`, damit Dialog und Gastformular dasselbe Verhalten haben.
 */
export default function FahrtenbuchEntryFields({
  form,
  persons,
}: FahrtenbuchEntryFieldsProps) {
  const t = useTranslations('fahrtenbuch');

  return (
    <>
      {form.saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {form.saveError}
        </Alert>
      )}
      {form.errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {form.errors.map((error) => (
            <div key={error}>{form.errorMessage(error)}</div>
          ))}
        </Alert>
      )}
      <Grid container spacing={2} sx={{ mt: 0 }}>
        <Grid size={{ xs: 12 }}>
          <TextField
            select
            fullWidth
            label={t('vehicle')}
            value={form.selectedVehicleId}
            onChange={(e) => form.changeVehicle(e.target.value)}
          >
            {form.vehicles.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Autocomplete
            freeSolo
            options={persons.map((p) => p.name)}
            value={form.driverName}
            onInputChange={(_, value) =>
              form.changeDriver(value, persons.find((p) => p.name === value)?.id)
            }
            renderInput={(params) => <TextField {...params} label={t('driver')} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            label={t('zweck')}
            value={form.zweck}
            onChange={(e) => form.setZweck(e.target.value as FahrtZweck)}
          >
            {FAHRT_ZWECKE.map((z) => (
              <MenuItem key={z} value={z}>
                {t(`zwecke.${z}` as 'zwecke.einsatz')}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label={t('ziel')}
            value={form.ziel}
            onChange={(e) => form.setZiel(e.target.value)}
          />
        </Grid>
        {/* Ohne Einsatzliste (Gastformular) entfällt die Auswahl ganz — der
            Zweck „Einsatz" bleibt wählbar, nur ohne Verknüpfung. */}
        {form.zweck === 'einsatz' && form.hasFirecallSelection && (
          <Grid size={{ xs: 12 }}>
            <TextField
              select
              fullWidth
              label={t('firecall')}
              value={form.firecallId ?? ''}
              onChange={(e) => form.changeFirecall(e.target.value)}
            >
              {form.firecalls?.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            type="datetime-local"
            label={t('abfahrt')}
            value={toLocalInput(form.abfahrt)}
            onChange={(e) => form.changeAbfahrt(fromLocalInput(e.target.value))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            type="datetime-local"
            label={t('ankunft')}
            value={toLocalInput(form.ankunft)}
            onChange={(e) => form.setAnkunft(fromLocalInput(e.target.value))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <CounterFields
            definitions={form.definitions}
            counters={form.counters}
            lastCounters={form.lastCounters}
            onChange={form.setCounters}
          />
        </Grid>
        {(form.vehicle?.fuelTypes ?? []).map((fuel) => (
          <Grid size={{ xs: 12, sm: 4 }} key={fuel}>
            <TextField
              fullWidth
              type="number"
              label={t(`fuel.${fuel}` as 'fuel.diesel')}
              value={form.betriebsmittel[fuel] ?? ''}
              onChange={(e) =>
                form.setBetriebsmittel({
                  ...form.betriebsmittel,
                  [fuel]: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </Grid>
        ))}
        <Grid size={{ xs: 12 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t('hinweise')}
            value={form.hinweise}
            onChange={(e) => form.setHinweise(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.defekt}
                onChange={(e) => form.setDefekt(e.target.checked)}
              />
            }
            label={t('defekt')}
          />
        </Grid>
      </Grid>
    </>
  );
}
